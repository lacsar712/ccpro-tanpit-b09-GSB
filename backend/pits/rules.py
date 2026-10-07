"""鞣坑规则：放液看最近酸碱度 3.5～5.0；西排权限按名单放行操作工。"""

import math

from pits.models import Pit, RowGrant

MIN_PH = 3.5
MAX_PH = 5.0

PH_FLOOR = 0.0
PH_CEIL = 14.0


class RuleError(ValueError):
    pass


class RowPermissionError(RuleError):
    """操作工改了名单之外的排。"""


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def row_label(pit: Pit) -> str:
    head = pit.code.split("-", 1)[0].strip()
    return f"{head}排" if head else f"第{pit.row + 1}排"


def assert_ph_legal(ph: float | None) -> float:
    if ph is None:
        raise RuleError("酸碱度不能为空")
    value = float(ph)
    if not math.isfinite(value):
        raise RuleError("酸碱度须为有效数字")
    if value < PH_FLOOR or value > PH_CEIL:
        raise RuleError(f"酸碱度须在 {PH_FLOOR:g}～{PH_CEIL:g} 之间")
    return value


def can_edit_pit(user, pit: Pit) -> bool:
    if user.role == "admin":
        return True
    grant = RowGrant.objects.filter(yard_id=pit.yard_id, row=pit.row).first()
    names = grant.names if grant and grant.names else []
    return user.username in names


def assert_can_edit_pit(user, pit: Pit) -> None:
    if can_edit_pit(user, pit):
        return
    raise RowPermissionError(f"{row_label(pit)}仅管理员可改，操作工不能登记酸碱度或改坑态")


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status != Pit.STATUS_DRAINED:
        return
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")
