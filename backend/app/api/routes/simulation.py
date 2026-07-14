"""Simulation session routes (with SSE streaming chat)."""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import build_llm_service, get_db
from app.models.simulation import SimulationMessage, SimulationReport, SimulationSession
from app.schemas.simulation import (
    SendMessageRequest,
    SimulationMessageOut,
    SimulationReportOut,
    SimulationSessionCreate,
    SimulationSessionDetail,
    SimulationSessionOut,
)
from app.services import report_service, simulation_service

router = APIRouter(tags=["simulation"])


@router.post("/simulation/sessions", status_code=201)
def create_session(data: SimulationSessionCreate, db: Session = Depends(get_db)):
    s = simulation_service.create_session(db, data)
    return SimulationSessionOut.model_validate(s).model_dump()


@router.get("/simulation/sessions")
def list_sessions(db: Session = Depends(get_db)):
    items = simulation_service.list_sessions(db)
    return {"items": [SimulationSessionOut.model_validate(s).model_dump() for s in items]}


@router.get("/simulation/sessions/{sid}")
def get_session(sid: str, db: Session = Depends(get_db)):
    s = simulation_service.get_session_detail(db, sid)
    if not s:
        raise HTTPException(status_code=404, detail="会话不存在")
    msgs = (
        db.query(SimulationMessage)
        .filter(SimulationMessage.session_id == sid)
        .order_by(SimulationMessage.seq)
        .all()
    )
    detail = SimulationSessionDetail.model_validate(s).model_dump()
    detail["messages"] = [SimulationMessageOut.model_validate(m).model_dump() for m in msgs]
    return detail


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/simulation/sessions/{sid}/opening")
async def opening(sid: str, db: Session = Depends(get_db)):
    llm = build_llm_service(db)

    async def gen():
        try:
            async for delta in simulation_service.opening_message_stream(db, llm, sid):
                yield _sse({"delta": delta})
            yield _sse({"done": True})
        except HTTPException as e:
            yield _sse({"error": str(e.detail)})
        except Exception as e:  # noqa: BLE001
            yield _sse({"error": str(e)[:300]})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/simulation/sessions/{sid}/messages")
async def send_message(
    sid: str, req: SendMessageRequest, db: Session = Depends(get_db)
):
    llm = build_llm_service(db)

    async def gen():
        try:
            async for delta in simulation_service.send_message_stream(db, llm, sid, req.content):
                yield _sse({"delta": delta})
            yield _sse({"done": True})
        except HTTPException as e:
            yield _sse({"error": str(e.detail)})
        except Exception as e:  # noqa: BLE001
            yield _sse({"error": str(e)[:300]})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/simulation/sessions/{sid}/retry")
async def retry_interviewer(sid: str, db: Session = Depends(get_db)):
    llm = build_llm_service(db)

    async def gen():
        try:
            async for delta in simulation_service.retry_interviewer_stream(db, llm, sid):
                yield _sse({"delta": delta})
            yield _sse({"done": True})
        except HTTPException as e:
            yield _sse({"error": str(e.detail)})
        except Exception as e:  # noqa: BLE001
            yield _sse({"error": str(e)[:300]})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/simulation/sessions/{sid}/finish")
async def finish_session(sid: str, db: Session = Depends(get_db)):
    llm = build_llm_service(db)
    rep = await report_service.generate_report(db, llm, sid)
    return SimulationReportOut.model_validate(rep).model_dump()


@router.delete("/simulation/sessions/{sid}", status_code=204)
def delete_session(sid: str, db: Session = Depends(get_db)):
    s = db.get(SimulationSession, sid)
    if not s:
        raise HTTPException(status_code=404, detail="会话不存在")
    # cascade delete messages and report manually
    db.query(SimulationMessage).filter(SimulationMessage.session_id == sid).delete()
    db.query(SimulationReport).filter(SimulationReport.session_id == sid).delete()
    db.delete(s)
    db.commit()
    return None


@router.get("/simulation/sessions/{sid}/report")
def get_report(sid: str, db: Session = Depends(get_db)):
    rep = report_service.get_report(db, sid)
    if not rep:
        raise HTTPException(status_code=404, detail="报告尚未生成")
    return SimulationReportOut.model_validate(rep).model_dump()
