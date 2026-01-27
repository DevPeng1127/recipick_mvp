package com.recipick.api.domain.ingredient.dto;

import com.recipick.api.domain.ingredient.entity.StorageType;
import java.time.LocalDate;

public record IngredientRequest(
        String name,
        LocalDate expiryDate,
        StorageType storageType,
        Integer quantity
) {}