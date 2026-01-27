import { create } from 'zustand'
import axios from 'axios'

export interface Ingredient {
    id: number
    name: string
    expiryDate: string
    storageType: 'FRIDGE' | 'FREEZER' | 'ROOM'
    quantity: number
}


// 입력받을 데이터 타입 (ID는 서버가 만드니까 제외)
export type IngredientInput = Omit<Ingredient, 'id'>

interface IngredientStore {
    ingredients: Ingredient[]
    fetchIngredients: () => Promise<void>
    addIngredient: (data: IngredientInput) => Promise<void> // ★ 추가된 기능
    recommendation: string; // 추천 결과 저장
    isRecommendLoading: boolean; // 로딩 상태
    fetchRecommendation: () => Promise<void>; // 추천 함수
}

export const useIngredientStore = create<IngredientStore>((set, get) => ({

    ingredients: [],
    fetchIngredients: async () => {
        try {
            const response = await axios.get('/api/v1/ingredients')
            set({ ingredients: response.data })
        } catch (error) {
            console.error('조회 실패:', error)
        }
    },
    // ★ 추가된 기능 구현
    addIngredient: async (data) => {
        try {
            await axios.post('/api/v1/ingredients', data)
            // 등록 성공하면 목록을 다시 불러와서 화면 갱신
            get().fetchIngredients()
        } catch (error) {
            console.error('등록 실패:', error)
            alert('재료를 냉장고에 넣지 못했어요 ㅠㅠ')
        }
    },

    recommendation: '',
    isRecommendLoading: false,

    fetchRecommendation: async () => {
        set({ isRecommendLoading: true, recommendation: '' }); // 로딩 시작
        try {
            const response = await axios.post('/api/v1/recipes/recommend');
            set({ recommendation: response.data.content });
        } catch (error) {
            console.error(error);
            alert('AI가 뇌정지 왔어요 ㅠㅠ');
        } finally {
            set({ isRecommendLoading: false }); // 로딩 끝
        }
    }
}));
