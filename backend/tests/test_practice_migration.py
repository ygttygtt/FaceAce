from sqlalchemy import create_engine, inspect, text

from app.db.migrate import run_migrations


def test_existing_practice_database_gets_analysis_and_follow_up_storage(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE practice_records (
                id VARCHAR(32) PRIMARY KEY,
                question_id VARCHAR(32) NOT NULL,
                user_answer TEXT,
                revealed BOOLEAN DEFAULT 0,
                duration_sec INTEGER DEFAULT 0,
                grading_id VARCHAR(32),
                created_at DATETIME,
                updated_at DATETIME
            )
        """))
        conn.execute(text("""
            CREATE TABLE grading_results (
                id VARCHAR(32) PRIMARY KEY,
                practice_record_id VARCHAR(32),
                question_id VARCHAR(32) NOT NULL,
                score INTEGER DEFAULT 0,
                verdict VARCHAR(32),
                strengths JSON,
                weaknesses JSON,
                missing_points JSON,
                detailed_feedback TEXT,
                improved_answer TEXT,
                llm_profile_id VARCHAR(32),
                raw_response TEXT,
                created_at DATETIME,
                updated_at DATETIME
            )
        """))
        conn.execute(text("""
            CREATE TABLE prompt_templates (
                id VARCHAR(32) PRIMARY KEY,
                key VARCHAR(64) UNIQUE NOT NULL,
                name VARCHAR(128) NOT NULL,
                content TEXT NOT NULL,
                variables JSON NOT NULL
            )
        """))
        conn.execute(text("""
            INSERT INTO prompt_templates (id, key, name, content, variables)
            VALUES ('custom', 'grading_rubric', '自定义批改', '不要覆盖我', '[]')
        """))

    run_migrations(engine)

    inspector = inspect(engine)
    grading_columns = {column["name"] for column in inspector.get_columns("grading_results")}
    assert "independent_analysis" in grading_columns
    assert inspector.has_table("practice_follow_up_messages")
    follow_up_columns = {
        column["name"] for column in inspector.get_columns("practice_follow_up_messages")
    }
    assert {"practice_record_id", "grading_result_id", "role", "content"}.issubset(
        follow_up_columns
    )
    with engine.connect() as conn:
        prompts = dict(conn.execute(text(
            "SELECT key, content FROM prompt_templates WHERE key IN "
            "('grading_rubric', 'independent_practice_analysis', 'practice_follow_up')"
        )).all())
    assert prompts["grading_rubric"] == "不要覆盖我"
    assert prompts["independent_practice_analysis"]
    assert prompts["practice_follow_up"]
    engine.dispose()
