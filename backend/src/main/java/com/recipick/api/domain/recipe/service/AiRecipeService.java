package com.recipick.api.domain.recipe.service;

import com.recipick.api.domain.ingredient.entity.Ingredient;
import com.recipick.api.domain.ingredient.repository.IngredientRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiRecipeService {

    private final IngredientRepository ingredientRepository;
    private final RestClient restClient = RestClient.create();

    // ★ 환경변수 주입 (이제 코드가 유출되어도 안전합니다)
    @Value("${gemini.api.key}")
    private String apiKey;

    @Value("${gemini.api.url}")
    private String apiUrl;

    public String recommendRecipe() {
        List<Ingredient> ingredients = ingredientRepository.findAll();
        if (ingredients.isEmpty()) return "냉장고가 텅 비었어요! 재료를 먼저 등록해주세요.";

        String ingredientList = ingredients.stream()
                .map(Ingredient::getName)
                .collect(Collectors.joining(", "));

        // 프롬프트 구성 (이전과 동일)
        String promptText = """
                당신은 자취 요리 전문가입니다. 보유 재료를 사용해 1인 가구 레시피를 1개 추천해주세요.
                
                [보유 재료]
                %s
                
                [제약 조건]
                1. 난이도 '하', 15분 이내 조리.
                2. 라면, 제육볶음 제외.
                3. 답변 형식:
                요리명: {요리 이름}
                필요재료: {재료 목록}
                조리법:
                1. {단계}
                꿀팁: {팁}
                """.formatted(ingredientList);

        try {
            // ★ 실제 API 호출
            GeminiResponse response = restClient.post()
                    .uri(apiUrl + "?key=" + apiKey) // URL에 키 포함
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(new GeminiRequest(List.of(
                            new GeminiRequest.Content(List.of(
                                    new GeminiRequest.Part(promptText)
                            ))
                    )))
                    .retrieve()
                    .body(GeminiResponse.class);

            // 응답에서 텍스트 추출
            return response.candidates().get(0).content().parts().get(0).text();

        } catch (Exception e) {
            log.error("Gemini API 호출 중 오류 발생", e);
            return "죄송해요, AI 쉐프가 지금 잠시 바쁩니다. (Error: " + e.getMessage() + ")";
        }
    }

    // ★ Java 21 Record를 활용한 일회용 DTO (Inner Class로 깔끔하게 처리)
    // 요청 DTO 구조
    record GeminiRequest(List<Content> contents) {
        record Content(List<Part> parts) {}
        record Part(String text) {}
    }

    // 응답 DTO 구조 (필요한 필드만 매핑)
    record GeminiResponse(List<Candidate> candidates) {
        record Candidate(Content content) {}
        record Content(List<Part> parts) {}
        record Part(String text) {}
    }
}