from app.ingest.extractor import extract


def test_text_extractor_falls_back_to_gb18030(tmp_path):
    source = tmp_path / "题库.txt"
    source.write_bytes("第一题：什么是事务？".encode("gb18030"))

    result = extract(str(source))

    assert result.full_text == "第一题：什么是事务？"
