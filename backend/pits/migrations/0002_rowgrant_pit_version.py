# 西排权限：RowGrant 名单 + Pit.version 乐观锁

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("pits", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="pit",
            name="version",
            field=models.IntegerField(default=0),
        ),
        migrations.CreateModel(
            name="RowGrant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("row", models.IntegerField(default=0)),
                ("names", models.JSONField(default=list)),
                (
                    "yard",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="row_grants",
                        to="pits.yard",
                    ),
                ),
            ],
            options={"unique_together": {("yard", "row")}},
        ),
    ]
