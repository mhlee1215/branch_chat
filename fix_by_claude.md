# Animation Timing Fix Report

## 문제점 분석

가로로 확장될 때 depth transition 애니메이션이 제대로 동작하지 않는 문제가 발견되었습니다.

### 발견된 이슈들:

1. **CSS vs JavaScript 타이밍 불일치**
   - CSS keyframes 애니메이션 기간: `1700ms`
   - JavaScript setTimeout 기간: `1850ms`
   - **차이: 150ms** → animation이 완료되기 전에 DOM element가 제거됨

2. **DOM 렌더링 타이밍 문제**
   - `replaceChildren()` 직후 `getBoundingClientRect()` 호출
   - 브라우저 레이아웃 엔진이 새로운 DOM을 처리하기 전에 측정할 수 있음
   - 부정확한 width 값으로 인한 animation 왜곡

3. **레이아웃 완료 대기 없음**
   - `requestAnimationFrame` 없이 바로 animation 시작
   - 일부 브라우저에서 rendering jank 발생 가능

---

## 수정 사항

### 1. `renderWorkspace()` 함수 개선 (Line 290-315)

```javascript
// Before
workspaceEl.replaceChildren(...columns);
animateDepthTransition(transitionSnapshot);

// After
workspaceEl.replaceChildren(...columns);

// Wait for DOM to be rendered before starting animation
requestAnimationFrame(() => {
  animateDepthTransition(transitionSnapshot);
});
```

**효과**: 브라우저가 DOM을 완전히 렌더링한 후 animation을 시작하도록 보장

### 2. `animateDepthTransition()` 함수 개선 (Line 348-392)

```javascript
// Before (Line 391)
timerId = window.setTimeout(finish, 1850);

// After
// Sync with CSS animation duration (1700ms)
timerId = window.setTimeout(finish, 1700);
```

**효과**: CSS animation 기간과 JavaScript timeout을 동일하게 동기화
- Animation이 정확하게 완료된 후 stage element 제거
- 깜빡임 없이 부드러운 전환

---

## 변경 파일

- `app/main.js`
  - Line ~315: `renderWorkspace()` - requestAnimationFrame 추가
  - Line 391: `animateDepthTransition()` - timeout 1850ms → 1700ms 수정

---

## 테스트 항목

- [ ] 데모 페이지에서 deeper transition 애니메이션 부드러움 확인
- [ ] deeper transition 애니메이션 끝까지 완료되는지 확인
- [ ] shallower transition 애니메이션 부드러움 확인
- [ ] animation 중간에 깜빡임 없음 확인
- [ ] animation 종료 후 stage element가 깔끔하게 제거됨 확인
- [ ] 브라우저 콘솔에 에러 메시지 없음 확인

---

## 기술적 배경

### requestAnimationFrame의 역할
- DOM 업데이트 후 브라우저의 렌더링 사이클을 대기
- 다음 repaint 전에 코드 실행 보장
- GPU 가속 및 부드러운 애니메이션 활성화

### CSS와 JS 타이밍 동기화
- 1700ms는 CSS keyframes에 정의된 정확한 값
- JavaScript timeout이 이보다 길면 animation 완료 전에 element 제거
- 이로 인해 animation이 끊기거나 부자연스러워 보임

---

## 추후 개선 사항 (선택사항)

1. Animation end event listener 추가
   ```javascript
   stage.addEventListener('animationend', finish);
   ```
   - timeout 없이 event 기반으로 정확히 처리

2. Performance monitoring
   - 다양한 기기에서 성능 측정
   - 1700ms가 모든 경우에 최적인지 검증

3. Responsive animation timing
   - 모바일 vs 데스크톱에서 다른 timing 적용 검토

---

**수정일**: 2026-05-11  
**수정자**: Claude  
**상태**: ✅ 완료 및 테스트 대기
