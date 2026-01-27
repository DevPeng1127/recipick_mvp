import { useState } from 'react'
import { useIngredientStore, IngredientInput } from '../store/useIngredientStore'

export default function IngredientForm() {
    const { addIngredient } = useIngredientStore()

    // 기본값 설정
    const initialState: IngredientInput = {
        name: '',
        expiryDate: new Date().toISOString().split('T')[0], // 오늘 날짜
        storageType: 'FRIDGE',
        quantity: 1
    }

    const [formData, setFormData] = useState<IngredientInput>(initialState)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.name) return alert('재료 이름을 입력해주세요!')

        await addIngredient(formData)
        setFormData(initialState) // 폼 초기화
        alert('냉장고에 쏙! 들어갔습니다. 🧊')
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-md mb-6 border border-blue-100">
            <h2 className="text-lg font-bold mb-4 text-gray-700">🛒 장본 거 냉장고에 넣기</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 재료 이름 */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">재료 이름</label>
                    <input
                        type="text"
                        placeholder="예: 두부, 삼겹살"
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 outline-none"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                </div>

                {/* 유통기한 */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">유통기한</label>
                    <input
                        type="date"
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 outline-none"
                        value={formData.expiryDate}
                        onChange={(e) => setFormData({...formData, expiryDate: e.target.value})}
                    />
                </div>

                {/* 보관 장소 */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">보관 장소</label>
                    <select
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 outline-none"
                        value={formData.storageType}
                        onChange={(e) => setFormData({...formData, storageType: e.target.value as any})}
                    >
                        <option value="FRIDGE">냉장실</option>
                        <option value="FREEZER">냉동실</option>
                        <option value="ROOM">실온</option>
                    </select>
                </div>

                {/* 수량 */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">수량</label>
                    <input
                        type="number"
                        min="1"
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-300 outline-none"
                        value={formData.quantity}
                        onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value)})}
                    />
                </div>
            </div>

            <button
                type="submit"
                className="w-full mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition duration-200"
            >
                등록하기
            </button>
        </form>
    )
}