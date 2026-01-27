import { useEffect } from 'react'
import { useIngredientStore } from './store/useIngredientStore'
import IngredientForm from './components/IngredientForm'

function App() {
    const { ingredients,
        fetchIngredients,
        recommendation,
        isRecommendLoading,
        fetchRecommendation
    } = useIngredientStore()

    useEffect(() => {
        fetchIngredients()
    }, [])

    return (
        <div className="min-h-screen bg-gray-100 p-8 font-sans">
            <div className="max-w-2xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-blue-600 mb-2">🧊 김자취의 냉장고</h1>
                    <p className="text-gray-500">현재 등록된 식재료: {ingredients.length}개</p>
                </header>

                {/* ★ 여기에 입력 폼 배치 */}
                <IngredientForm />

                {/* ★ AI 레시피 추천 섹션 시작 */}
                <div className="mb-6">
                    <button
                        onClick={fetchRecommendation}
                        disabled={isRecommendLoading || ingredients.length === 0}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] flex justify-center items-center gap-2
          ${ingredients.length === 0
                            ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                            : 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:shadow-indigo-500/30'}`}
                    >
                        {isRecommendLoading ? (
                            <>✨ 김자취님을 위한 레시피 고민 중...</>
                        ) : (
                            <>🤖 AI 쉐프에게 냉장고 털기 부탁하기</>
                        )}
                    </button>

                    {/* 추천 결과 표시 카드 */}
                    {recommendation && (
                        <div className="mt-6 bg-white border-2 border-purple-100 rounded-xl p-6 shadow-md animate-fade-in-up">
                            <h3 className="text-xl font-bold text-purple-700 mb-4 border-b pb-2">🍳 추천 레시피 도착!</h3>
                            <div className="whitespace-pre-line text-gray-700 leading-relaxed">
                                {recommendation}
                            </div>
                        </div>
                    )}
                </div>
                {/* ★ AI 레시피 추천 섹션 끝 */}

                {/* 아래는 기존 리스트 코드 (그대로 유지) */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    {ingredients.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            <p className="text-4xl mb-4">🍽️</p>
                            냉장고가 텅 비었어요.<br/>위에서 재료를 등록해주세요!
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {ingredients.map((item) => (
                                <li key={item.id} className="p-4 hover:bg-gray-50 flex justify-between items-center transition">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-gray-800">{item.name}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded text-white ${
                                                item.storageType === 'FREEZER' ? 'bg-blue-400' :
                                                    item.storageType === 'FRIDGE' ? 'bg-green-400' : 'bg-orange-400'
                                            }`}>
                        {item.storageType === 'FREEZER' ? '냉동' : item.storageType === 'FRIDGE' ? '냉장' : '실온'}
                      </span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">{item.quantity}개 남음</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-red-500">
                                            유통기한: {item.expiryDate}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}

export default App