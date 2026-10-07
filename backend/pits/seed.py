from pits.models import ColumnGrant, LiquorSample, Pit, User, Yard


def seed_demo() -> None:
    admin, _ = User.objects.get_or_create(username="admin", defaults={"role": "admin"})
    admin.role = "admin"
    admin.set_password("123456")
    admin.save()
    worker, _ = User.objects.get_or_create(username="worker", defaults={"role": "worker"})
    worker.role = "worker"
    worker.set_password("123456")
    worker.save()

    fresh = not Yard.objects.exists()
    if fresh:
        yard = Yard.objects.create(name="南冈鞣场", village="青皮村")
        layout = [
            ("东-1", Pit.STATUS_TANNING, 0, 0, 4.2),
            ("东-2", Pit.STATUS_FILL, 0, 1, None),
            ("中-1", Pit.STATUS_DRAINED, 1, 0, 4.6),
            ("中-2", Pit.STATUS_TANNING, 1, 1, 6.1),
            ("西-1", Pit.STATUS_FILL, 2, 0, None),
            ("西-2", Pit.STATUS_DRAINED, 2, 1, 3.8),
        ]
        for code, status, row, col, ph in layout:
            pit = Pit.objects.create(yard=yard, code=code, status=status, row=row, col=col)
            if ph is not None:
                LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")

    # 名单按坑列立条：西-1、西-2 归 worker，其余列为空名；老库重跑也补齐
    for pit in Pit.objects.all():
        grant, created = ColumnGrant.objects.get_or_create(pit=pit)
        wanted = worker if pit.row == 2 else None
        if created or grant.assignee_id != (wanted.id if wanted else None):
            grant.assignee = wanted
            grant.save()
