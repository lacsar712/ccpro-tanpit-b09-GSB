"""鞣坑规则：放液门槛 3.5～5.0，操作工西排权限。"""

from pits.models import ColumnGrant, ROW_NAMES, WORKER_ROW, Pit, User

MIN_PH = 3.5
MAX_PH = 5.0


class RuleError(ValueError):
    """业务规则不通过（400）。"""


class GrantError(PermissionError):
    """西排权限不通过（403）。"""


class StaleVersionError(RuntimeError):
    """乐观版本号过期（409）。"""


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def row_name(pit: Pit) -> str:
    return ROW_NAMES.get(pit.row, f"第{pit.row}排")


def assert_worker_row(user: User, pit: Pit) -> None:
    """操作工只许写西排；管理员不受此限。

    - 东排 / 中排：一律挡住，并给中文说明。
    - 西排但责任名单上该列为空（空名列）：工人也不得改。
    """
    if user.role == "admin":
        return
    if pit.row != WORKER_ROW:
        raise GrantError(
            f"操作工只能写西排坑位，{pit.code} 属{row_name(pit)}，已被挡下；请找管理员处理"
        )
    try:
        grant = pit.grant
    except ColumnGrant.DoesNotExist:
        grant = None
    if grant is None or grant.assignee_id is None:
        raise GrantError(f"{pit.code} 所在列在西排权限名单中为空名，未指定操作工，不能改")


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
