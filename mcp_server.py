"""
Aura MCP Server
================
Exposes Aura's tool logic (trigger_xr_scene, show_environment_menu, stop_xr_tour,
end_session, show_voice_menu) as MCP tools using FastMCP.

This server owns the *business logic only* — validating arguments, shaping the
JSON payload the browser client should receive, and deciding what Aura should
say next. It never touches a websocket directly, since it doesn't own any live
connection. bot.py runs as an MCP client against this server: its
llm.register_function() handlers call these tools, then apply the returned
"message" to the actual websocket + pipecat pipeline state.

Place this file next to bot.py (it reads the same client/environments.json).

Run it on its own:
    python mcp_server.py

It listens on http://127.0.0.1:8100/mcp by default. Override with the
MCP_HOST / MCP_PORT env vars. bot.py finds it via MCP_SERVER_URL, which
defaults to that same address.
"""

import os
import json
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

# --- Load the same environment config bot.py uses, so sub_type / scene_name
# validation always matches what's actually available on the client side.
_ENV_CONFIG_PATH = Path(__file__).parent / "client" / "environments.json"
with open(_ENV_CONFIG_PATH) as _f:
    _ENV_CONFIG = json.load(_f)

ALL_SUB_TYPES = [e["sub_type"] for e in _ENV_CONFIG["environments"]]
SCENE_NAMES = list(_ENV_CONFIG["categories"].keys())

# Kept identical to the lists in bot.py's SYSTEM_INSTRUCTION_TEMPLATE / tool
# schemas. If you ever add a guidance category or subcategory, update both
# places together.
GUIDANCE_CATEGORIES = [
    "calm_reset", "mental_clearing", "emotional_lightening",
    "sensory_peace", "reflection_mode", "energy_restore"
]
GUIDANCE_SUBCATEGORIES = [
    "breathing_reset", "slow_grounding", "nervous_quieting", "silence_companion",
    "mind_declutter", "slow_thought_release", "guided_mental_pause",
    "gentle_reassurance", "release_session", "emotional_quiet",
    "rain_sound_immersion", "temple_bells_soft_field", "forest_atmosphere",
    "deep_ocean_tone", "himalayan_ambience",
    "gratitude_pause", "silent_self_note", "voice_journal",
    "morning_reset", "fatigue_lift", "soft_alertness"
]

mcp = FastMCP(name="Aura-XR-Tools")


def _check(value: str, allowed: list[str], label: str) -> None:
    if value not in allowed:
        raise ToolError(f"Unknown {label}: '{value}'. Must be one of: {', '.join(allowed)}")


@mcp.tool
def trigger_xr_scene(
    scene_name: str,
    sub_type: str,
    guidance_category: str,
    guidance_subcategory: str,
) -> dict:
    """Starts a visual XR environment tour (Nature, Meditation, Spiritual).

    Returns the client message to dispatch over the websocket plus the prompt
    Aura should use to begin the guided meditation (Phase 1 + 2 only)."""
    _check(scene_name, SCENE_NAMES, "scene_name")
    _check(sub_type, ALL_SUB_TYPES, "sub_type")
    _check(guidance_category, GUIDANCE_CATEGORIES, "guidance_category")
    _check(guidance_subcategory, GUIDANCE_SUBCATEGORIES, "guidance_subcategory")

    return {
        "message": {
            "action": "trigger_scene",
            "scene_name": scene_name.lower(),
            "sub_type": sub_type.lower(),
            "guidance_category": guidance_category.lower(),
            "guidance_subcategory": guidance_subcategory.lower(),
        },
        "set_meditating": True,
        "llm_prompt": (
            f"The {sub_type} visual is now live. Guidance mode: "
            f"{guidance_category}/{guidance_subcategory}. "
            "BEGIN YOUR GUIDED MEDITATION NOW. "
            "Speak in a highly soothing, EXTREMELY slow, ASMR-style whispered meditation voice. "
            "Deliver Phase 1 (Arrival) and Phase 2 (Body Settling) only for now. "
            "Use generous, long ellipses (... ... ...) to space out your words: "
            "Keep it to 2-3 slow sentences, and then stop speaking. You will be prompted later to continue."
        ),
    }


@mcp.tool
def show_environment_menu(
    top_sub_type: str,
    recommended_sub_types: list[str],
    guidance_category: str,
    guidance_subcategory: str,
    reason: str,
) -> dict:
    """Builds the environment menu shown to the user after intake.

    Guarantees the top recommendation is included and the final list is
    deduped down to exactly 3 entries, matching the original tool's contract."""
    _check(top_sub_type, ALL_SUB_TYPES, "top_sub_type")
    for st in recommended_sub_types:
        _check(st, ALL_SUB_TYPES, "recommended_sub_type")
    _check(guidance_category, GUIDANCE_CATEGORIES, "guidance_category")
    _check(guidance_subcategory, GUIDANCE_SUBCATEGORIES, "guidance_subcategory")

    if top_sub_type not in recommended_sub_types:
        recommended_sub_types = [top_sub_type] + list(recommended_sub_types)
    recommended_sub_types = list(dict.fromkeys(recommended_sub_types))[:3]

    return {
        "message": {
            "action": "show_environment_menu",
            "top_sub_type": top_sub_type,
            "recommended_sub_types": recommended_sub_types,
            "guidance_category": guidance_category,
            "guidance_subcategory": guidance_subcategory,
            "reason": reason,
        },
        "llm_prompt": (
            "[SYSTEM: The environment menu is now visible on the user's screen. "
            "Do NOT speak or say anything right now. Stay completely silent. "
            "The user is choosing an environment. You will be notified when they make a choice.]"
        ),
    }


@mcp.tool
def stop_xr_tour() -> dict:
    """Stops the current visual tour and returns Aura to the center."""
    return {
        "message": {"action": "stop_tour"},
        "set_meditating": False,
        "llm_prompt": "Tour stopped. Aura is back in the center.",
    }


@mcp.tool
def end_session(show_feedback: bool) -> dict:
    """Ends the active session, optionally routing the client into the
    feedback flow first."""
    return {
        "message": {"action": "end_session", "show_feedback": show_feedback},
        "set_meditating": False,
        "llm_prompt": f"Session ended. show_feedback was {show_feedback}.",
    }


@mcp.tool
def show_voice_menu() -> dict:
    """Shows the voice-selection cards (Solaya / Sam) to the user."""
    return {
        "message": {"action": "show_voice_menu"},
        "llm_prompt": (
            "[SYSTEM: The voice menu is now visible on the user's screen. "
            "Do NOT speak or say anything right now. Stay completely silent while they choose.]"
        ),
    }


if __name__ == "__main__":
    host = os.getenv("MCP_HOST", "127.0.0.1")
    port = int(os.getenv("MCP_PORT", "8100"))
    print(f"Aura MCP server listening on http://{host}:{port}/mcp")
    mcp.run(transport="http", host=host, port=port)
