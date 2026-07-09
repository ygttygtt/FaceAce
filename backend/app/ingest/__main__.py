"""CLI entry point: python -m app.ingest <file> [--auto-approve] [--profile ID]"""
import argparse
import asyncio
import sys
from pathlib import Path

from app.core.ids import new_id
from app.db.seed import seed_default_data
from app.db.session import SessionLocal, init_db
from app.ingest.pipeline import run_pipeline
from app.models.ingest import IngestJob


def main() -> None:
    parser = argparse.ArgumentParser(description="FaceAce 文档导入")
    parser.add_argument("file", help="文档路径 (.md/.txt/.docx/.pdf)")
    parser.add_argument("--profile", default=None, help="使用的 LLM profile id(默认用默认 profile)")
    parser.add_argument("--auto-approve", action="store_true", help="跳过人工审核直接入库")
    args = parser.parse_args()

    p = Path(args.file)
    if not p.exists():
        print(f"文件不存在: {p}", file=sys.stderr)
        sys.exit(1)

    init_db()
    db = SessionLocal()
    try:
        seed_default_data(db)
        job = IngestJob(
            id=new_id(),
            file_name=p.name,
            file_path=str(p.resolve()),
            status="queued",
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        print(f"导入任务已创建: {job.id}")
        asyncio.run(
            run_pipeline(db, job, profile_id=args.profile, auto_approve=args.auto_approve)
        )
        db.refresh(job)
        print(f"完成: status={job.status}, 题目数={job.question_count}")
        if job.status == "pending_review":
            print("请在 Web 端「导入」页审核入库,或加 --auto-approve 直接入库。")
        if job.error_message:
            print(f"错误: {job.error_message}", file=sys.stderr)
    finally:
        db.close()


if __name__ == "__main__":
    main()
