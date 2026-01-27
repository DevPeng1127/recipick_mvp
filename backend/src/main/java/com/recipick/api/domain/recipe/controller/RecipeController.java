package com.recipick.api.domain.recipe.controller;

import com.recipick.api.domain.recipe.service.AiRecipeService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/recipes")
@RequiredArgsConstructor
public class RecipeController {

    private final AiRecipeService aiRecipeService;

    // AI 추천 요청
    @PostMapping("/recommend")
    public Map<String, String> recommend() {
        String result = aiRecipeService.recommendRecipe();
        // JSON 형태로 반환
        return Map.of("content", result);
    }
}