import asyncio

from app.ingest.normalizer import normalize_chunk
from app.schemas.llm_output import NormalizedQuestion, NormalizedQuestions


class AlwaysOverSplitLLM:
    def __init__(self):
        self.calls = 0

    async def structured(self, _messages, _schema, **_kwargs):
        self.calls += 1
        return NormalizedQuestions(questions=[
            NormalizedQuestion(
                question_text="设计实时语音 Agent",
                tags=["Agent"],
                standard_answer="主答案",
                answer_points=["整体设计"],
            ),
            NormalizedQuestion(
                question_text="用户打断怎么处理",
                tags=["语音"],
                standard_answer="停止播放",
                answer_points=["处理打断"],
            ),
            NormalizedQuestion(
                question_text="降级策略是什么",
                tags=["容错"],
                standard_answer="提供降级",
                answer_points=["降级"],
            ),
        ])


def test_explicit_heading_retries_then_deterministically_collapses_over_split_result(db):
    llm = AlwaysOverSplitLLM()

    questions = asyncio.run(normalize_chunk(
        db,
        llm,
        "### 题8｜设计实时语音 Agent\n#### 用户打断\n#### 降级策略",
        expected_count=1,
        boundary_type="explicit_question_heading",
        question_heading="题8｜设计实时语音 Agent",
    ))

    assert llm.calls == 2
    assert len(questions) == 1
    assert questions[0].question_text == "设计实时语音 Agent"
    assert questions[0].answer_points == ["整体设计", "处理打断", "降级"]
    assert questions[0].group_id is None
