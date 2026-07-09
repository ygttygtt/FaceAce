"""One-off: detect follow-up chains (追问/进阶) in the imported LLM doc and
assign group_id / group_seq / group_label to the 84 existing questions.

Run AFTER the backend has restarted (so the group_* columns exist):
    cd backend
    .venv/Scripts/python.exe regroup.py
"""
import re
from app.db.session import SessionLocal
from app.core.ids import new_id
from app.models.ingest import IngestJob
from app.models.question import Question

DOC = r"E:/YGTT_Project/FaceAce/data/LLM面试通关笔记_合并版(1).md"


def main() -> None:
    src = open(DOC, encoding="utf-8").read()
    section_at = {m.start(): m.group(2).strip() for m in re.finditer(r"^#\s+([一二三四五六七八九十]+)、(.+)$", src, re.M)}
    qpos = [m.start() for m in re.finditer(r"\*\*面试官：\*\*", src)]

    def section_for(pos: str) -> str:
        cur = ""
        for p, name in sorted(section_at.items()):
            if p <= pos:
                cur = name
            else:
                break
        return cur

    blocks = re.split(r"\*\*面试官：\*\*", src)[1:]
    # build ordered list: (raw_index, section, is_followup, qtext)
    order = []
    for k, blk in enumerate(blocks, 1):
        pos = qpos[k - 1]
        section = section_for(pos)
        nl = blk.find("\n")
        qline = blk[:nl] if nl != -1 else blk
        is_followup = ("（追问）" in qline) or ("（进阶）" in qline) or ("（场景）" in qline)
        qtext = re.sub(r"（追问）|（进阶）|（场景）", "", qline).replace("🔥", "").strip()
        qtext = re.sub(r"\[基础\]|\[进阶\]|\[追问\]|\[场景\]", "", qtext)
        qtext = re.sub(r"\s+", " ", qtext).strip()
        order.append((k, section, is_followup, qtext))

    db = SessionLocal()
    job = db.query(IngestJob).first()
    # group detection: base starts a chain; followups extend it; only size>=2 gets group_id
    chains: list[list[int]] = []  # each chain = list of raw_index
    cur: list[int] = []
    for raw_idx, section, is_fu, qtext in order:
        if not is_fu:
            if len(cur) >= 2:
                chains.append(cur)
            cur = [raw_idx]
        else:
            if not cur:
                cur = [raw_idx]  # followup without base -> own chain
            else:
                cur.append(raw_idx)
    if len(cur) >= 2:
        chains.append(cur)

    # clear existing groups, then assign
    db.query(Question).filter(Question.source_file == job.file_name).update(
        {Question.group_id: None, Question.group_seq: None, Question.group_label: None},
        synchronize_session=False,
    )

    assigned = 0
    for chain in chains:
        gid = new_id()
        for seq, raw_idx in enumerate(chain, 1):
            q = (
                db.query(Question)
                .filter(Question.source_file == job.file_name, Question.source_raw_index == raw_idx)
                .first()
            )
            if q:
                q.group_id = gid
                q.group_seq = seq
                if seq == 1:
                    q.group_label = (q.question_text[:18] + "…") if len(q.question_text) > 18 else q.question_text
                assigned += 1
    db.commit()
    print(f"检测到追问链 {len(chains)} 条,打标题目 {assigned} 题(均属于 size>=2 的链)")
    db.close()


if __name__ == "__main__":
    main()
