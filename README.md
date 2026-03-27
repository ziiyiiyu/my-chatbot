# HW1-You own ChatGPT

使用 Next.js、Tailwind CSS 與 Google Gemini（Vercel AI SDK）建立的仿 ChatGPT 網頁應用程式。

## 功能特色

- 即時串流回應（Streaming）搭配打字機效果
- 模型切換：Gemini 2.5 Flash、2.5 Pro、2.5 Flash Lite
- 自訂系統提示（System Prompt）
- Temperature 滑桿（範圍 0–2）
- Max Tokens 輸入（範圍 100–4096）
- 對話記憶（會話內保留聊天歷史）
- Party Mode：輸入 `/partymode` 觸發隨機變色效果

## 安裝與啟動

### 1. 安裝依賴套件

```bash
npm install
```

### 2. 設定 API 金鑰

編輯 `.env.local`，將佔位符替換為你的實際金鑰：

```
GOOGLE_GENERATIVE_AI_API_KEY=你的金鑰
```

取得金鑰：前往 https://aistudio.google.com/app/apikey

### 3. 啟動開發伺服器

```bash
npm run dev
```

開啟瀏覽器，前往 [http://localhost:3000](http://localhost:3000)。

---

## 測試方法

### 基本功能測試

1. **串流回應**
   - 在輸入框輸入任意問題（例如：「請介紹台灣」），按下 Enter 或點擊 Send
   - 預期：AI 回應文字應逐字出現（串流效果），並顯示「Thinking...」動畫

2. **模型切換**
   - 在左側選單切換至 `Gemini 2.5 Pro` 或 `Gemini 2.5 Flash Lite`
   - 發送一則訊息
   - 預期：成功收到回應，確認模型已切換（可透過不同回應風格觀察）

3. **系統提示（System Prompt）**
   - 在 System Prompt 欄位輸入：「你是一個只會說台語的助理」
   - 發送任意訊息
   - 預期：AI 以台語回應

4. **Temperature 調整**
   - 將 Temperature 設為 `0.0`，多次問同一個問題（例如：「用一句話介紹自己」）
   - 預期：回應較固定、一致
   - 再將 Temperature 設為 `2.0`，重複同樣操作
   - 預期：回應較多變、創意

5. **Max Tokens 限制**
   - 將 Max Tokens 設為 `100`，請 AI 寫一篇長文章
   - 預期：回應在約 100 tokens 處截斷

6. **對話歷史記憶**
   - 先說：「我的名字是小明」
   - 下一則訊息問：「我的名字是什麼？」
   - 預期：AI 能回答「小明」（代表上下文記憶正常）

### 錯誤處理測試

7. **API 金鑰錯誤**
   - 暫時在 `.env.local` 中填入錯誤的金鑰，重新啟動 `npm run dev`
   - 發送訊息
   - 預期：畫面顯示紅色錯誤訊息提示，而非空白或崩潰

---

## 技術架構

| 項目 | 版本／說明 |
|------|-----------|
| Next.js | 16（App Router） |
| React | 19 |
| Tailwind CSS | v4（CSS-first 設定） |
| Vercel AI SDK | `ai` v6 + `@ai-sdk/google` + `@ai-sdk/react` |
| 圖示 | `lucide-react` |
