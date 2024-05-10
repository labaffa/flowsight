from fews2board.db.models import MyBase
import sqlalchemy as sa


class MarkerTable(MyBase):
    """It saves update_id from luigi tasks. Need to be read by base_classes"""

    __tablename__ = "marker_table"

    update_id = sa.Column(sa.Text, primary_key=True, autoincrement=False)
    target_table = sa.Column(sa.Text)
    inserted = sa.Column(sa.DateTime, server_default=sa.sql.func.now())
    
