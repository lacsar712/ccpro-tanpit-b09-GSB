from django.contrib.auth.hashers import check_password, make_password
from django.db import models

# 行号即排别：0 东排，1 中排，2 西排
ROW_EAST = 0
ROW_MIDDLE = 1
ROW_WEST = 2
ROW_NAMES = {
    ROW_EAST: "东排",
    ROW_MIDDLE: "中排",
    ROW_WEST: "西排",
}
# 操作工只能写西排（种子里的西-1、西-2 这一列）
WORKER_ROW = ROW_WEST


class User(models.Model):
    username = models.CharField(max_length=64, unique=True)
    password_hash = models.CharField(max_length=256)
    role = models.CharField(max_length=20, default="worker")

    def set_password(self, raw: str) -> None:
        self.password_hash = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return check_password(raw, self.password_hash)


class Yard(models.Model):
    name = models.CharField(max_length=120)
    village = models.CharField(max_length=120, blank=True)


class Pit(models.Model):
    STATUS_FILL = "fill"
    STATUS_TANNING = "tanning"
    STATUS_DRAINED = "drained"

    yard = models.ForeignKey(Yard, on_delete=models.CASCADE, related_name="pits")
    code = models.CharField(max_length=40)
    status = models.CharField(max_length=20, default=STATUS_FILL)
    row = models.IntegerField(default=0)
    col = models.IntegerField(default=0)
    # 每次酸碱度 / 坑态写入选自增，前端按它做乐观并发控制
    version = models.IntegerField(default=0)

    class Meta:
        unique_together = ("yard", "code")


class ColumnGrant(models.Model):
    """西排权限专页名单：哪一列归谁改。assignee 为空 = 空名列，工人不可改。"""

    pit = models.OneToOneField(Pit, on_delete=models.CASCADE, related_name="grant")
    assignee = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="grants"
    )

    class Meta:
        # 名单只读，专页与接口都不提供改派入口
        pass


class LiquorSample(models.Model):
    pit = models.ForeignKey(Pit, on_delete=models.CASCADE, related_name="samples")
    taken_at = models.DateTimeField(auto_now_add=True)
    ph = models.FloatField()
    operator = models.CharField(max_length=64, blank=True)
