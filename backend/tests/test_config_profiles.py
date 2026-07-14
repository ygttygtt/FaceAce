from app.api.routes.config import create_profile, update_profile
from app.models.config import UserConfig
from app.schemas.config import LLMProfileCreate, LLMProfileUpdate


def test_new_default_profile_becomes_active(db):
    profile = create_profile(
        LLMProfileCreate(
            name="DeepSeek",
            base_url="https://api.deepseek.com/v1",
            api_key="sk-test",
            model="deepseek-v4-flash",
            is_default=True,
        ),
        db,
    )

    assert db.query(UserConfig).first().active_llm_profile_id == profile["id"]


def test_updating_default_profile_switches_active_profile(db):
    first = create_profile(
        LLMProfileCreate(
            name="First",
            base_url="https://example.com/v1",
            api_key="one",
            model="model-one",
            is_default=True,
        ),
        db,
    )
    second = create_profile(
        LLMProfileCreate(
            name="Second",
            base_url="https://example.org/v1",
            api_key="two",
            model="model-two",
            is_default=False,
        ),
        db,
    )

    update_profile(second["id"], LLMProfileUpdate(is_default=True), db)

    assert db.query(UserConfig).first().active_llm_profile_id == second["id"]
    assert first["id"] != second["id"]
