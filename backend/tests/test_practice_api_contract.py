from app.main import app


def test_practice_follow_up_uses_one_consistent_plural_endpoint():
    schema = app.openapi()
    path = "/api/practice/records/{record_id}/follow-ups"

    assert path in schema["paths"]
    assert {"get", "post"}.issubset(schema["paths"][path])
    assert "/api/practice/records/{record_id}/follow-up" not in schema["paths"]


def test_stream_grading_exposes_optional_independent_analysis_flag():
    schema = app.openapi()
    request_schema = schema["components"]["schemas"]["GradeRequest"]

    assert "include_independent_analysis" in request_schema["properties"]
