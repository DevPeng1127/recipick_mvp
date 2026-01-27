package com.recipick.api.domain.ingredient.controller;

import com.recipick.api.domain.ingredient.dto.IngredientRequest;
import com.recipick.api.domain.ingredient.entity.Ingredient;
import com.recipick.api.domain.ingredient.repository.IngredientRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/ingredients")
@RequiredArgsConstructor
public class IngredientController {

    private final IngredientRepository ingredientRepository;

    // 1. 식재료 등록
    @PostMapping
    public Ingredient save(@RequestBody IngredientRequest request) {
        Ingredient ingredient = new Ingredient(
                request.name(),
                request.expiryDate(),
                request.storageType(),
                request.quantity()
        );
        return ingredientRepository.save(ingredient);
    }

    // 2. 냉장고 조회
    @GetMapping
    public List<Ingredient> getAll() {
        return ingredientRepository.findAll();
    }
}