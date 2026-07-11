import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { useThemeStore } from "@/stores/chatStore";
import type { GraphEvent } from "@/types";

interface ReasoningTreeProps {
  events: GraphEvent[];
}

export function ReasoningTree({ events }: ReasoningTreeProps) {
  const darkMode = useThemeStore((s) => s.darkMode);

  const { nodes, edges } = useMemo(() => {
    const nodeBg = darkMode ? "#171717" : "#ffffff";
    const nodeText = darkMode ? "#fafafa" : "#0a0a0a";
    const edgeColor = darkMode ? "#525252" : "#d4d4d4";

    const completedBorder = darkMode ? "2px solid #fafafa" : "2px solid #0a0a0a";
    const runningBorder = "2px dashed #737373";
    const failedBorder = darkMode ? "2px solid #525252" : "2px solid #a3a3a3";

    const nodes: Node[] = events.map((event, i) => {
      const border =
        event.status === "completed"
          ? completedBorder
          : event.status === "running"
            ? runningBorder
            : failedBorder;
      return {
        id: event.node,
        type: "default",
        position: { x: 40, y: i * 88 },
        data: {
          label: (
            <div className="text-xs">
              <div className="font-semibold">{event.label}</div>
              <div className="mt-0.5 capitalize text-muted-foreground">{event.type}</div>
            </div>
          ),
        },
        style: {
          background: nodeBg,
          color: nodeText,
          border,
          borderRadius: 12,
          padding: "10px 14px",
          minWidth: 180,
          boxShadow: darkMode ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
        },
      };
    });

    const edges: Edge[] = events.slice(1).map((event, i) => ({
      id: `e-${i}`,
      source: events[i].node,
      target: event.node,
      animated: event.status === "running",
      style: { stroke: edgeColor, strokeWidth: 1.5 },
    }));

    return { nodes, edges };
  }, [events, darkMode]);

  if (!events.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground">
          Send a message to view intent routing, agent selection, and memory steps.
        </p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
      className="bg-transparent"
    >
      <Background color={darkMode ? "#262626" : "#e5e5e5"} gap={20} size={1} />
      <Controls showInteractive={false} className="!rounded-lg !border-border !shadow-sm" />
    </ReactFlow>
  );
}
