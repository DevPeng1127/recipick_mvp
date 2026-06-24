import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              문제가 발생했습니다
            </h1>
            <p className="text-gray-600 mb-6">
              예상치 못한 오류가 발생했습니다. 아래 버튼을 눌러 다시 시도해주세요.
            </p>
            <a
              href="/dashboard"
              className="inline-block px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700"
            >
              대시보드로 돌아가기
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
