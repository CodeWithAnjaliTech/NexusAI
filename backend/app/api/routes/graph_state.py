"""LangGraph execution tree API for React Flow visualization."""

import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.message import Message
from app.db.session import get_db
from app.schemas.graph_state import GraphEdge, GraphNode, GraphStateResponse

router = APIRouter(prefix="/graph-state", tags=["graph-state"])


def _build_flow_from_events(events: list[dict]) -> tuple[list[GraphNode], list[GraphEdge]]:
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    for i, event in enumerate(events):
        node_id = event.get("node", f"node_{i}")
        nodes.append(
            GraphNode(
                id=node_id,
                type=event.get("type", "default"),
                label=event.get("label", node_id),
                status=event.get("status", "completed"),
                metadata=event.get("metadata", {}),
            )
        )
        if i > 0:
            prev_id = events[i - 1].get("node", f"node_{i-1}")
            edges.append(
                GraphEdge(
                    id=f"edge_{i}",
                    source=prev_id,
                    target=node_id,
                )
            )

    return nodes, edges


@router.get("/{session_id}", response_model=GraphStateResponse)
async def get_graph_state(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> GraphStateResponse:
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id, Message.role == "assistant")
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    message = result.scalar_one_or_none()

    if not message or not message.metadata_json:
        return GraphStateResponse(session_id=session_id, nodes=[], edges=[])

    try:
        metadata = json.loads(message.metadata_json)
        events = metadata.get("graph_events", [])
    except json.JSONDecodeError:
        events = []

    nodes, edges = _build_flow_from_events(events)
    current = nodes[-1].id if nodes else None

    return GraphStateResponse(
        session_id=session_id,
        nodes=nodes,
        edges=edges,
        current_node=current,
    )
