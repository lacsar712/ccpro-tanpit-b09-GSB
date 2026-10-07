import time

from django.db import OperationalError, transaction
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError, ValidationError as NinjaValidationError

from pits.auth import BearerAuth, make_token
from pits.models import Pit, User, Yard
from pits.rules import (
    RowPermissionError,
    RuleError,
    assert_can_edit_pit,
    assert_can_set_status,
    assert_ph_legal,
    can_edit_pit,
    latest_ph,
    row_label,
)

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float | None = None
    version: int | None = None


class StatusIn(Schema):
    status: str
    version: int | None = None


@api.exception_handler(NinjaValidationError)
def validation_errors(request, exc):
    return api.create_response(request, {"detail": "请求参数有误，请检查输入"}, status=422)


def pit_json(pit: Pit, user: User) -> dict:
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "version": pit.version,
        "editable": can_edit_pit(user, pit),
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
    }


def lock_pit(pit_id: int) -> Pit:
    pit = Pit.objects.select_for_update().filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    return pit


def assert_row_allowed(user: User, pit: Pit) -> None:
    try:
        assert_can_edit_pit(user, pit)
    except RowPermissionError as exc:
        raise HttpError(403, str(exc))


def assert_version_current(pit: Pit, version: int | None) -> None:
    if version is not None and version != pit.version:
        raise HttpError(409, "该坑刚被他人修改，请刷新后再试")


def run_serialized(work):
    """串行执行坑位写操作。Postgres 靠 select_for_update 行锁；
    sqlite 没有行锁，偶发 database is locked 时重试，重进事务后版本检查照样挡旧写。"""
    for attempt in range(5):
        try:
            return work()
        except OperationalError as exc:
            if "locked" not in str(exc).lower() or attempt == 4:
                raise
            time.sleep(0.1 * (attempt + 1))


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/board", auth=auth)
def board(request):
    yard = Yard.objects.prefetch_related("pits__samples").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p, request.auth) for p in pits]}


@api.get("/permissions", auth=auth)
def permissions(request):
    """西排权限专页数据：各排可改名单，只读。"""
    yard = Yard.objects.prefetch_related("pits", "row_grants").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    grants = {g.row: list(g.names or []) for g in yard.row_grants.all()}
    rows = []
    for row in sorted({p.row for p in yard.pits.all()}):
        pits_in_row = sorted((p for p in yard.pits.all() if p.row == row), key=lambda p: p.col)
        names = grants.get(row, [])
        rows.append(
            {
                "row": row,
                "label": row_label(pits_in_row[0]),
                "codes": [p.code for p in pits_in_row],
                "names": names,
                "workerEditable": bool(names),
                "note": "操作工可登记酸碱度与改坑态" if names else "名单为空，操作工不可改",
            }
        )
    return {"yard": yard.name, "note": "名单只读；管理员不受此限", "rows": rows}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    def work():
        with transaction.atomic():
            pit = lock_pit(pit_id)
            assert_row_allowed(request.auth, pit)
            try:
                ph = assert_ph_legal(payload.ph)
            except RuleError as exc:
                raise HttpError(400, str(exc))
            assert_version_current(pit, payload.version)
            pit.samples.create(ph=ph, operator=request.auth.username)
            pit.version += 1
            pit.save(update_fields=["version"])
            return pit

    pit = run_serialized(work)
    return pit_json(pit, request.auth)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    def work():
        with transaction.atomic():
            pit = lock_pit(pit_id)
            assert_row_allowed(request.auth, pit)
            assert_version_current(pit, payload.version)
            try:
                assert_can_set_status(pit, payload.status)
            except RuleError as exc:
                raise HttpError(400, str(exc))
            pit.status = payload.status
            pit.version += 1
            pit.save(update_fields=["status", "version"])
            return pit

    pit = run_serialized(work)
    return pit_json(pit, request.auth)
