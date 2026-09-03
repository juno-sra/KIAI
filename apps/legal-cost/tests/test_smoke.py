import legalcost


def test_package_exposes_page_size():
    assert legalcost.PAGE_SIZE == (595.2, 841.68)
