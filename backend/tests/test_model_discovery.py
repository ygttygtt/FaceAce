from app.api.routes.config import _model_ids


def test_model_ids_supports_openai_shape():
    assert _model_ids({"data": [{"id": "model-b"}, {"id": "model-a"}]}) == [
        "model-a",
        "model-b",
    ]


def test_model_ids_supports_alternative_shapes_and_deduplicates():
    assert _model_ids({"models": ["z-model", {"name": "a-model"}, {"model": "z-model"}]}) == [
        "a-model",
        "z-model",
    ]
