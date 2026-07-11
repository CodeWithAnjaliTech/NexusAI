"""Safe calculator tool — evaluates basic math expressions."""

import ast
import operator
import re

_BINARY_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval_node(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPS:
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        return _BINARY_OPS[type(node.op)](left, right)
    raise ValueError("Unsupported expression")


def extract_math_expression(query: str) -> str | None:
    """Pull a math expression from natural language."""
    match = re.search(
        r"(?:calculate|compute|what is|evaluate|solve)?\s*([0-9+\-*/().%\s^]+)",
        query,
        re.I,
    )
    if not match:
        return None
    expr = match.group(1).strip().replace("^", "**").replace("%", "/100*")
    if not re.fullmatch(r"[\d+\-*/().\s]+", expr.replace("**", "")):
        return None
    return expr


def calculate(expression: str) -> str:
    """Evaluate a numeric expression safely."""
    expr = expression.strip().replace("^", "**")
    tree = ast.parse(expr, mode="eval")
    result = _eval_node(tree)
    if result == int(result):
        return str(int(result))
    return f"{result:.6g}"
