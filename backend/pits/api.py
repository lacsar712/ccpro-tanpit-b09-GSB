import math
from typing import Optional

from django.db import transaction
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError, ValidationError as NinjaValidationError

from pits.auth import BearerAuth, make_token
from pits.models import WORKER_ROW, ColumnGrant, Pit, User, Yard
from pits.rules import (
    GrantError,
    RuleError,
    StaleVersionError,
    assert_can_set_status,
    assert_worker_row,
    latest_ph,
    row_name,
)

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


@api.exception_handler(NinjaValidationError)
def validation_cn(request, exc):
    # 字段类型不对（如酸碱度填了非数字）也给中文，不露出框架英文
    return api.create_response(request, {"detail": "提交内容有误，请核对字段后重试"}, status=400)


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    # 允许缺空，由接口给出中文提示，而不是框架英文报错
    ph: Optional[float] = None
    expected: Optional[int] = None


class StatusIn(Schema):
    status: str
    expected: Optional[int] = None


def _grant_of(pit: Pit) -> "ColumnGrant | None":
    try:
        grant = pit.grant
    except ColumnGrant.DoesNotExist:
        return None
    return None if grant.assignee_id is None else grant


def pit_json(pit: Pit) -> dict:
    grant = _grant_of(pit)
    assignee = grant.assignee.username if grant else None
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "rowName": row_name(pit),
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
        "version": pit.version,
        "assignee": assignee,
    }


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
    yard = Yard.objects.prefetch_related("pits__samples", "pits__grant__assignee").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p) for p in pits]}


@api.get("/grants", auth=auth)
def grants(request):
    """西排权限专页名单：只读，列出谁能改哪列。不提供任何改派入口。"""
    yard = Yard.objects.prefetch_related("pits__grant__assignee").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    rows = []
    for pit in sorted(yard.pits.all(), key=lambda p: (p.row, p.col)):
        grant = _grant_of(pit)
        rows.append(
            {
                "pitId": pit.id,
                "code": pit.code,
                "row": pit.row,
                "rowName": row_name(pit),
                "col": pit.col,
                "assignee": grant.assignee.username if grant else None,
                "workerEditable": pit.row == WORKER_ROW
                and grant is not None
                and grant.assignee_id is not None,
            }
        )
    return {"rows": rows, "readOnly": True}


def _locked_pit(pit_id: int) -> Pit | None:
    return (
        Pit.objects.select_for_update()
        .select_related("grant__assignee")
        .filter(id=pit_id)
        .first()
    )


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    if payload.ph is None:
        raise HttpError(400, "酸碱度不能为空，西排权限不允许放空酸碱过关")
    if not math.isfinite(payload.ph):
        raise HttpError(400, "酸碱度必须是有效数字")
    with transaction.atomic():
        pit = _locked_pit(pit_id)
        if pit is None:
            raise HttpError(404, "坑不存在")
        try:
            assert_worker_row(request.auth, pit)
            if payload.expected is not None and payload.expected != pit.version:
                raise StaleVersionError("该坑刚被别人改过，请刷新到最新酸碱度后再改")
        except GrantError as exc:
            raise HttpError(403, str(exc))
        except StaleVersionError as exc:
            raise HttpError(409, str(exc))
        pit.samples.create(ph=payload.ph, operator=request.auth.username)
        pit.version += 1
        pit.save(update_fields=["version"])
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    with transaction.atomic():
        pit = _locked_pit(pit_id)
        if pit is None:
            raise HttpError(404, "坑不存在")
        try:
            assert_worker_row(request.auth, pit)
            if payload.expected is not None and payload.expected != pit.version:
                raise StaleVersionError("该坑刚被别人改过，请刷新到最新状态后再改")
            assert_can_set_status(pit, payload.status)
        except GrantError as exc:
            raise HttpError(403, str(exc))
        except StaleVersionError as exc:
            raise HttpError(409, str(exc))
        except RuleError as exc:
            raise HttpError(400, str(exc))
        pit.status = payload.status
        pit.version += 1
        pit.save(update_fields=["status", "version"])
    pit.refresh_from_db()
    return pit_json(pit)
