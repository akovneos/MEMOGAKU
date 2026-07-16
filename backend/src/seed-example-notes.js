import "dotenv/config";
import { initDb, query } from "./db.js";

const userEmail = "a.kov.neos@gmail.com";

const notes = [
  {
    title: "Amazon EC2の基本",
    subject: "AWS Compute",
    content: "Amazon EC2はクラウド上で仮想サーバーを作成して利用できるサービスです。インスタンスタイプ、AMI、セキュリティグループ、キーペアを選んで起動します。",
    studyDate: "2026-07-14",
    studyMinutes: 45,
    understanding: "普通",
    reviewDate: "2026-07-14",
    memo: "セキュリティグループは仮想ファイアウォールとして覚える。",
    aiSummary: "EC2はAWS上で仮想サーバーを起動する基本サービスです。AMI、インスタンスタイプ、セキュリティグループを理解すると構成を説明しやすくなります。",
    reviewQuestions: ["Q1. EC2は何のために使いますか？", "Q2. AMIとは何ですか？", "Q3. セキュリティグループの役割は？"],
    isLearned: false,
    createdAt: "2026-07-14T09:10:00+09:00"
  },
  {
    title: "S3バケットとオブジェクト",
    subject: "AWS Storage",
    content: "Amazon S3はオブジェクトストレージです。データはバケットの中にオブジェクトとして保存され、静的サイトホスティングやバックアップにも使えます。",
    studyDate: "2026-07-14",
    studyMinutes: 35,
    understanding: "よく理解した",
    reviewDate: "2026-07-21",
    memo: "バケット名はグローバルで一意にする必要がある。",
    aiSummary: "S3はファイルをオブジェクトとして保存するストレージサービスです。バケット、オブジェクト、権限設定の関係が重要です。",
    reviewQuestions: ["Q1. S3はどんなストレージですか？", "Q2. バケットとは何ですか？", "Q3. S3を使う代表例は？"],
    isLearned: false,
    createdAt: "2026-07-14T09:40:00+09:00"
  },
  {
    title: "IAMユーザーとロール",
    subject: "AWS Security",
    content: "IAMはAWSの認証と認可を管理するサービスです。ユーザー、グループ、ロール、ポリシーを使って、誰が何をできるかを制御します。",
    studyDate: "2026-07-13",
    studyMinutes: 50,
    understanding: "まだ難しい",
    reviewDate: "2026-07-14",
    memo: "ユーザーは人、ロールはサービスや一時的な権限として整理する。",
    aiSummary: "IAMはAWSの権限管理サービスです。ユーザーとロールの違い、ポリシーによる許可の考え方が重要です。",
    reviewQuestions: ["Q1. IAMは何を管理しますか？", "Q2. IAMロールはどんな時に使いますか？", "Q3. ポリシーは何を定義しますか？"],
    isLearned: false,
    createdAt: "2026-07-13T15:20:00+09:00"
  },
  {
    title: "VPCとサブネット",
    subject: "AWS Network",
    content: "VPCはAWS上に作る自分専用の仮想ネットワークです。サブネットを作り、パブリックサブネットとプライベートサブネットに分けて構成します。",
    studyDate: "2026-07-12",
    studyMinutes: 60,
    understanding: "普通",
    reviewDate: "2026-07-15",
    memo: "パブリックはインターネットに出られる、プライベートは内部向け。",
    aiSummary: "VPCはAWS内の仮想ネットワークです。サブネット分割とルートテーブルの理解がネットワーク設計の基本になります。",
    reviewQuestions: ["Q1. VPCとは何ですか？", "Q2. サブネットを分ける理由は？", "Q3. パブリックサブネットの特徴は？"],
    isLearned: false,
    createdAt: "2026-07-12T10:00:00+09:00"
  },
  {
    title: "RDSとマネージドDB",
    subject: "AWS Database",
    content: "Amazon RDSはリレーショナルデータベースを簡単に運用できるマネージドサービスです。バックアップ、パッチ適用、Multi-AZ構成などを利用できます。",
    studyDate: "2026-07-11",
    studyMinutes: 40,
    understanding: "よく理解した",
    reviewDate: "2026-07-18",
    memo: "EC2にDBを入れるより運用負担が小さい。",
    aiSummary: "RDSはMySQLやPostgreSQLなどのDB運用をAWSに任せられるサービスです。可用性やバックアップ機能が特徴です。",
    reviewQuestions: ["Q1. RDSは何のサービスですか？", "Q2. Multi-AZの目的は？", "Q3. RDSの運用メリットは？"],
    isLearned: false,
    createdAt: "2026-07-11T11:15:00+09:00"
  },
  {
    title: "Lambdaとサーバーレス",
    subject: "AWS Compute",
    content: "AWS Lambdaはサーバーを管理せずにコードを実行できるサービスです。イベントに応じて関数が実行され、実行時間に応じて課金されます。",
    studyDate: "2026-07-14",
    studyMinutes: 55,
    understanding: "普通",
    reviewDate: "2026-07-17",
    memo: "API GatewayやS3イベントと組み合わせる例を覚える。",
    aiSummary: "Lambdaはイベント駆動でコードを実行するサーバーレスサービスです。サーバー管理不要で小さな処理に向いています。",
    reviewQuestions: ["Q1. Lambdaの特徴は？", "Q2. サーバーレスとは何ですか？", "Q3. Lambdaが起動するきっかけの例は？"],
    isLearned: false,
    createdAt: "2026-07-14T12:05:00+09:00"
  },
  {
    title: "CloudWatchの監視",
    subject: "AWS Monitoring",
    content: "Amazon CloudWatchはメトリクス、ログ、アラームを使ってAWSリソースやアプリケーションを監視するサービスです。",
    studyDate: "2026-07-10",
    studyMinutes: 30,
    understanding: "普通",
    reviewDate: "2026-07-14",
    memo: "CPU使用率やログ監視、アラーム通知を確認する。",
    aiSummary: "CloudWatchはAWS環境の状態を可視化し、異常を検知する監視サービスです。",
    reviewQuestions: ["Q1. CloudWatchで確認できるものは？", "Q2. アラームは何のために使いますか？", "Q3. ログ監視の利点は？"],
    isLearned: false,
    createdAt: "2026-07-10T18:30:00+09:00"
  },
  {
    title: "CloudFrontとCDN",
    subject: "AWS Network",
    content: "Amazon CloudFrontはCDNサービスです。世界中のエッジロケーションからコンテンツを配信し、表示速度と可用性を高めます。",
    studyDate: "2026-07-09",
    studyMinutes: 35,
    understanding: "よく理解した",
    reviewDate: "2026-07-16",
    memo: "S3静的サイトと組み合わせる構成を復習する。",
    aiSummary: "CloudFrontはコンテンツをエッジから配信するCDNです。遅延を減らし、アクセス集中にも強くなります。",
    reviewQuestions: ["Q1. CDNとは何ですか？", "Q2. CloudFrontを使うメリットは？", "Q3. オリジンとは何ですか？"],
    isLearned: true,
    createdAt: "2026-07-09T13:00:00+09:00"
  },
  {
    title: "Route 53とDNS",
    subject: "AWS Network",
    content: "Amazon Route 53はDNSサービスです。ドメイン名をIPアドレスやAWSリソースへ名前解決し、ヘルスチェックやルーティングポリシーも使えます。",
    studyDate: "2026-07-08",
    studyMinutes: 45,
    understanding: "まだ難しい",
    reviewDate: "2026-07-14",
    memo: "Aレコード、CNAME、Aliasレコードの違いを整理する。",
    aiSummary: "Route 53はAWSのDNSサービスです。ドメインとリソースを結びつけ、柔軟なルーティングを設定できます。",
    reviewQuestions: ["Q1. DNSは何をしますか？", "Q2. Route 53の役割は？", "Q3. Aliasレコードは何に使いますか？"],
    isLearned: false,
    createdAt: "2026-07-08T16:45:00+09:00"
  },
  {
    title: "ECSとコンテナ実行",
    subject: "AWS Container",
    content: "Amazon ECSはコンテナを管理して実行するサービスです。タスク定義、サービス、クラスターを使ってコンテナアプリを運用します。",
    studyDate: "2026-07-07",
    studyMinutes: 65,
    understanding: "普通",
    reviewDate: "2026-07-20",
    memo: "Fargateを使うとサーバー管理がさらに少なくなる。",
    aiSummary: "ECSはDockerコンテナをAWS上で実行・管理するサービスです。タスク定義とサービスの関係が重要です。",
    reviewQuestions: ["Q1. ECSは何を実行するサービスですか？", "Q2. タスク定義には何を書きますか？", "Q3. Fargateの特徴は？"],
    isLearned: true,
    createdAt: "2026-07-07T09:25:00+09:00"
  },
  {
    title: "API Gatewayの役割",
    subject: "AWS Serverless",
    content: "Amazon API GatewayはAPIを作成、公開、保護するサービスです。Lambdaと組み合わせることでサーバーレスAPIを構築できます。",
    studyDate: "2026-07-14",
    studyMinutes: 50,
    understanding: "まだ難しい",
    reviewDate: "2026-07-16",
    memo: "REST APIとHTTP APIの違いをあとで確認する。",
    aiSummary: "API Gatewayは外部からAPIを呼び出せる入口を作るサービスです。Lambdaと組み合わせるとサーバーレスAPIを作れます。",
    reviewQuestions: ["Q1. API Gatewayの役割は？", "Q2. Lambdaと組み合わせる理由は？", "Q3. APIを保護する方法の例は？"],
    isLearned: false,
    createdAt: "2026-07-14T14:20:00+09:00"
  },
  {
    title: "DynamoDBの特徴",
    subject: "AWS Database",
    content: "Amazon DynamoDBはフルマネージドのNoSQLデータベースです。キー設計が重要で、高いスケーラビリティと低レイテンシが特徴です。",
    studyDate: "2026-07-05",
    studyMinutes: 55,
    understanding: "普通",
    reviewDate: "2026-07-14",
    memo: "パーティションキーとソートキーを具体例で復習する。",
    aiSummary: "DynamoDBはスケールしやすいNoSQLデータベースです。アクセスパターンを考えたキー設計が重要です。",
    reviewQuestions: ["Q1. DynamoDBはどんなDBですか？", "Q2. パーティションキーの役割は？", "Q3. RDSとの違いは？"],
    isLearned: false,
    createdAt: "2026-07-05T10:40:00+09:00"
  },
  {
    title: "SQSと非同期処理",
    subject: "AWS Integration",
    content: "Amazon SQSはメッセージキューサービスです。処理を非同期化し、システム同士を疎結合にするために使います。",
    studyDate: "2026-07-04",
    studyMinutes: 35,
    understanding: "よく理解した",
    reviewDate: "2026-07-19",
    memo: "キューに入れて後で処理するイメージ。",
    aiSummary: "SQSはメッセージをキューに保存し、非同期処理を実現するサービスです。障害に強い構成を作りやすくなります。",
    reviewQuestions: ["Q1. SQSは何のために使いますか？", "Q2. 非同期処理のメリットは？", "Q3. 疎結合とは何ですか？"],
    isLearned: true,
    createdAt: "2026-07-04T17:05:00+09:00"
  },
  {
    title: "SNSと通知配信",
    subject: "AWS Integration",
    content: "Amazon SNSはメッセージを複数の購読先へ配信するPub/Subサービスです。メール通知、Lambda起動、SQS連携などに使えます。",
    studyDate: "2026-07-03",
    studyMinutes: 30,
    understanding: "普通",
    reviewDate: "2026-07-14",
    memo: "SNSは配信、SQSはキューとして区別する。",
    aiSummary: "SNSはメッセージを複数の宛先へ配信する通知サービスです。イベント通知や連携処理に使えます。",
    reviewQuestions: ["Q1. SNSは何をするサービスですか？", "Q2. Pub/Subとは何ですか？", "Q3. SQSとの違いは？"],
    isLearned: false,
    createdAt: "2026-07-03T08:50:00+09:00"
  },
  {
    title: "ALBと負荷分散",
    subject: "AWS Network",
    content: "Application Load BalancerはHTTP/HTTPSトラフィックを複数のターゲットへ分散します。可用性を高め、パスベースルーティングもできます。",
    studyDate: "2026-07-02",
    studyMinutes: 40,
    understanding: "普通",
    reviewDate: "2026-07-15",
    memo: "ターゲットグループとヘルスチェックを理解する。",
    aiSummary: "ALBはWebアクセスを複数のサーバーへ分散するロードバランサーです。可用性と柔軟なルーティングに役立ちます。",
    reviewQuestions: ["Q1. ALBは何を分散しますか？", "Q2. ターゲットグループとは？", "Q3. ヘルスチェックの目的は？"],
    isLearned: false,
    createdAt: "2026-07-02T19:30:00+09:00"
  },
  {
    title: "Auto Scalingの考え方",
    subject: "AWS Compute",
    content: "Auto Scalingは負荷に応じてEC2インスタンス数を自動調整する仕組みです。必要な時に増やし、不要な時に減らしてコストを抑えます。",
    studyDate: "2026-07-01",
    studyMinutes: 45,
    understanding: "よく理解した",
    reviewDate: "2026-07-21",
    memo: "最小、希望、最大キャパシティをセットで覚える。",
    aiSummary: "Auto Scalingは需要に合わせてサーバー数を増減させる仕組みです。可用性とコスト最適化に役立ちます。",
    reviewQuestions: ["Q1. Auto Scalingの目的は？", "Q2. スケールアウトとは？", "Q3. 希望キャパシティとは？"],
    isLearned: true,
    createdAt: "2026-07-01T12:10:00+09:00"
  },
  {
    title: "CloudFormationとIaC",
    subject: "AWS IaC",
    content: "AWS CloudFormationはインフラ構成をテンプレートとして管理するIaCサービスです。同じ環境を再現しやすく、変更履歴も管理しやすくなります。",
    studyDate: "2026-06-30",
    studyMinutes: 70,
    understanding: "まだ難しい",
    reviewDate: "2026-07-14",
    memo: "テンプレート、スタック、変更セットを整理する。",
    aiSummary: "CloudFormationはインフラをコードとして定義するサービスです。再現性のある環境構築に使えます。",
    reviewQuestions: ["Q1. IaCとは何ですか？", "Q2. CloudFormationのスタックとは？", "Q3. テンプレートに書く内容は？"],
    isLearned: false,
    createdAt: "2026-06-30T09:00:00+09:00"
  },
  {
    title: "AWS Well-Architected Framework",
    subject: "AWS Architecture",
    content: "Well-Architected FrameworkはAWSで良い設計をするための考え方です。運用上の優秀性、セキュリティ、信頼性、パフォーマンス効率、コスト最適化、持続可能性の柱があります。",
    studyDate: "2026-06-29",
    studyMinutes: 80,
    understanding: "普通",
    reviewDate: "2026-07-18",
    memo: "6つの柱を暗記するだけでなく、設計判断に使う。",
    aiSummary: "Well-Architected FrameworkはAWS設計を評価するためのベストプラクティス集です。6つの柱で構成を見直します。",
    reviewQuestions: ["Q1. Well-Architectedの目的は？", "Q2. 6つの柱を挙げてください。", "Q3. コスト最適化で考えることは？"],
    isLearned: true,
    createdAt: "2026-06-29T21:20:00+09:00"
  },
  {
    title: "AWS料金とコスト管理",
    subject: "AWS Cost",
    content: "AWSでは使った分だけ料金が発生します。Cost Explorer、Budgets、タグ付け、Savings Plansなどを使ってコストを可視化し管理します。",
    studyDate: "2026-06-28",
    studyMinutes: 35,
    understanding: "まだ難しい",
    reviewDate: "2026-07-16",
    memo: "無料枠と予算アラートを必ず確認する。",
    aiSummary: "AWSのコスト管理では利用状況を可視化し、予算やアラートで使いすぎを防ぎます。",
    reviewQuestions: ["Q1. Cost Explorerで何を確認しますか？", "Q2. Budgetsの役割は？", "Q3. コストを下げる方法の例は？"],
    isLearned: false,
    createdAt: "2026-06-28T15:55:00+09:00"
  },
  {
    title: "AWS共有責任モデル",
    subject: "AWS Security",
    content: "共有責任モデルでは、AWSはクラウド自体のセキュリティを担当し、ユーザーはクラウド内で使う設定やデータを保護します。",
    studyDate: "2026-06-27",
    studyMinutes: 30,
    understanding: "よく理解した",
    reviewDate: "2026-07-23",
    memo: "AWSの責任と利用者の責任をサービスごとに分けて考える。",
    aiSummary: "共有責任モデルはAWSと利用者のセキュリティ責任範囲を分ける考え方です。",
    reviewQuestions: ["Q1. AWSが責任を持つ範囲は？", "Q2. 利用者が責任を持つ範囲は？", "Q3. S3で利用者が注意する設定は？"],
    isLearned: true,
    createdAt: "2026-06-27T07:35:00+09:00"
  }
];

await initDb();

const userResult = await query("SELECT id FROM users WHERE email = $1", [userEmail]);

if (userResult.rowCount === 0) {
  throw new Error(`User ${userEmail} was not found.`);
}

const userId = userResult.rows[0].id;

await query("DELETE FROM notes WHERE user_id = $1", [userId]);

for (const note of notes) {
  await query(
    `INSERT INTO notes
      (user_id, title, subject, content, study_date, study_minutes, understanding, review_date, memo, ai_summary, review_questions, is_learned, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $13)`,
    [
      userId,
      note.title,
      note.subject,
      note.content,
      note.studyDate,
      note.studyMinutes,
      note.understanding,
      note.reviewDate,
      note.memo,
      note.aiSummary,
      JSON.stringify(note.reviewQuestions),
      note.isLearned,
      note.createdAt
    ]
  );
}

const count = await query("SELECT COUNT(*)::int AS count FROM notes WHERE user_id = $1", [userId]);
const learned = await query("SELECT COUNT(*)::int AS count FROM notes WHERE user_id = $1 AND is_learned = TRUE", [userId]);
console.log(`deleted_existing_notes=true`);
console.log(`seeded=${notes.length}`);
console.log(`learned=${learned.rows[0].count}`);
console.log(`user_notes_total=${count.rows[0].count}`);
process.exit(0);
