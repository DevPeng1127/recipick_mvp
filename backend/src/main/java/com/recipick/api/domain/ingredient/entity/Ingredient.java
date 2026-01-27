package com.recipick.api.domain.ingredient.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDate;

@Entity
@Getter
@NoArgsConstructor
public class Ingredient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    private LocalDate expiryDate; // 유통기한

    @Enumerated(EnumType.STRING)
    private StorageType storageType;

    private Integer quantity; // 개수 or 용량 (MVP에선 단순 정수로)

    // 생성자
    public Ingredient(String name, LocalDate expiryDate, StorageType storageType, Integer quantity) {
        this.name = name;
        this.expiryDate = expiryDate;
        this.storageType = storageType;
        this.quantity = quantity;
    }
}