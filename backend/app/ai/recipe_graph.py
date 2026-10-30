from typing import TypedDict

from langgraph.graph import END, StateGraph

from app.ai.gemini_client import call_gemini
from app.ai.prompts import build_recipe_prompt
from app.models.ingredient import Ingredient
from app.models.user import UserPreference
from app.schemas.recipe import GeneratedRecipe


class RecipeState(TypedDict):
    user_id: int
    servings: int
    priority_ingredient_ids: list[int]
    ingredients: list[Ingredient]
    preference: UserPreference | None
    prompt: str
    raw_response: str
    recipe: GeneratedRecipe | None


def gather_context(state: RecipeState) -> dict:
    return {
        "ingredients": state["ingredients"],
        "preference": state["preference"],
    }


def build_prompt(state: RecipeState) -> dict:
    prompt = build_recipe_prompt(state["ingredients"], state["preference"], state["servings"], state.get("priority_ingredient_ids", []))
    return {"prompt": prompt}


async def call_gemini_node(state: RecipeState) -> dict:
    response = await call_gemini(state["prompt"], user_id=state["user_id"],
                                 response_schema=GeneratedRecipe.model_json_schema())
    return {"raw_response": response}


def parse_response(state: RecipeState) -> dict:
    return {"recipe": GeneratedRecipe.model_validate_json(state["raw_response"])}


def build_recipe_graph() -> StateGraph:
    graph = StateGraph(RecipeState)

    graph.add_node("gather_context", gather_context)
    graph.add_node("build_prompt", build_prompt)
    graph.add_node("call_gemini", call_gemini_node)
    graph.add_node("parse_response", parse_response)

    graph.set_entry_point("gather_context")
    graph.add_edge("gather_context", "build_prompt")
    graph.add_edge("build_prompt", "call_gemini")
    graph.add_edge("call_gemini", "parse_response")
    graph.add_edge("parse_response", END)

    return graph


async def run_recipe_graph(
    ingredients: list[Ingredient], preference: UserPreference | None, *, user_id: int, servings: int = 1,
    priority_ingredient_ids: list[int] | None = None,
) -> GeneratedRecipe:
    graph = build_recipe_graph()
    app = graph.compile()

    initial_state: RecipeState = {
        "user_id": user_id,
        "servings": servings,
        "priority_ingredient_ids": priority_ingredient_ids or [],
        "ingredients": ingredients,
        "preference": preference,
        "prompt": "",
        "raw_response": "",
        "recipe": None,
    }

    result = await app.ainvoke(initial_state)
    return result["recipe"]
