# 公開用 ドキュメント

このフォルダにはカイゼンスコープのプライバシーポリシーやストア用アセットを格納しています。

## 📄 ファイル

- `privacy.html` — Play Store 提出用のプライバシーポリシー (公開用 HTML)
- `feature-graphic.svg` — フィーチャーグラフィック原本
- `feature-graphic.png` — フィーチャーグラフィック (1024×500、Play Store 提出用)
- `store-listing.md` — Play Store 掲載文の草稿(短文/長文)
- `screenshots-guide.md` — スクリーンショット撮影ガイド

## 🚀 プライバシーポリシーを GitHub Pages で公開する (5分)

Play Store はプライバシーポリシーを **公開 URL** で提供することを要求します。
GitHub Pages なら無料で 5 分で公開できます。

### Step 1: GitHub リポジトリを公開設定にする

このプロジェクトの GitHub リポジトリ(まだなければ作成)を **Public** に設定します。

> ⚠️ プライベートリポジトリでは GitHub Pages は使えません(無料プランの場合)。
> プライバシーポリシー専用に別の Public リポジトリを作るのも OK です。

### Step 2: Settings → Pages を開く

GitHub 上で:
1. リポジトリの **Settings** タブを開く
2. 左メニュー下の **Pages** をクリック

### Step 3: ソースを設定

- **Source**: `Deploy from a branch`
- **Branch**: `main` (またはあなたのデフォルトブランチ)
- **Folder**: `/docs` を選択
- **Save** をクリック

### Step 4: 数分待つと URL が発行される

ページ上部に「Your site is live at」と表示されます:

```
https://<あなたのGitHubユーザー名>.github.io/<リポジトリ名>/privacy.html
```

例: `https://takochan-gadget.github.io/genba-ie-checker/privacy.html`

### Step 5: アプリ側の URL を差し替える

`src/components/AppInfoModal.tsx` の冒頭:

```ts
const PRIVACY_POLICY_URL = 'https://example.com/kaizenscope/privacy';
```

を Step 4 でもらった URL に置き換えます。

### Step 6: Play Console に登録

Play Console の「ポリシー」→「アプリのコンテンツ」→「プライバシーポリシー」に同じ URL を貼ります。

---

## 別案: Notion / Google Sites で公開する

GitHub を使いたくない場合の代替手段。Notion ページなら以下の手順:

1. Notion で新規ページ作成
2. `privacy.html` の内容をコピーして貼り付け(整形は崩れますが内容は OK)
3. ページ右上の **共有** → **Web で公開**
4. 発行された URL を Play Console に登録

要件は「**閲覧用 URL がインターネットから誰でも見られる**」だけです。サーバーは何でも OK。
