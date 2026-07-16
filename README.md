# 学習メモAI管理アプリ

学習した内容をメモとして保存し、AI要約と復習問題で復習をサポートする学習用アプリです。

## 概要

```text
勉強する
↓
学習メモを登録する
↓
AI要約で内容を整理する
↓
復習問題で理解を確認する
```

## 機能

- ユーザー登録
- ログイン / ログアウト
- 学習メモ登録
- 学習メモ一覧表示
- 学習メモ詳細表示
- 学習メモ編集 / 削除
- 検索
- 理解度管理
- 次回復習日
- タグ
- AI要約
- 復習問題作成

## 学習メモの項目

- タイトル
- 科目
- 内容
- 学習日
- 理解度
- 次回復習日
- タグ
- メモ

## フォルダ構成

```text
ai-1-2-3-ai-react-2/
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  └─ style.css
│  ├─ index.html
│  └─ package.json
├─ backend/
│  ├─ src/
│  │  └─ server.js
│  ├─ notes.json
│  ├─ users.json
│  └─ package.json
└─ README.md
```

## 起動方法

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

URL:

```text
http://127.0.0.1:5173
```
