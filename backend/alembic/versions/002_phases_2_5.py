"""Phase 2–5 schema migration."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002_phases_2_5"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("plan", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    op.add_column("users", sa.Column("hashed_password", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("users", sa.Column("role", sa.String(50), server_default="member", nullable=False))
    op.create_foreign_key("fk_users_organization", "users", "organizations", ["organization_id"], ["id"])
    op.create_index("ix_users_organization_id", "users", ["organization_id"])

    op.create_table(
        "agent_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_key", sa.String(100), nullable=False),
        sa.Column("intent", sa.String(100), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_metrics_agent_key", "agent_metrics", ["agent_key"])
    op.create_index("ix_agent_metrics_organization_id", "agent_metrics", ["organization_id"])


def downgrade() -> None:
    op.drop_table("agent_metrics")
    op.drop_constraint("fk_users_organization", "users", type_="foreignkey")
    op.drop_index("ix_users_organization_id", "users")
    op.drop_column("users", "role")
    op.drop_column("users", "organization_id")
    op.drop_column("users", "hashed_password")
    op.drop_table("organizations")
