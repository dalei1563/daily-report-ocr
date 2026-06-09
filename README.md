# 本地部署版日报表 OCR 识别工具

一套面向供应商本地部署的日报表 OCR 工具：图片上传、PaddleOCR-VL 识别、OpenAI 协议大模型结构化抽取、人工校准、SQLite 入库、查询和 Excel 导出。

## 快速启动

1. 复制环境变量：

```powershell
Copy-Item .env.example .env
```

2. 编辑 `.env`，填写 `PADDLE_OCR_TOKEN`、`LLM_API_KEY` 和 `APP_SECRET_KEY`。

3. Docker 启动：

```powershell
docker compose up --build
```

4. 打开：

- 前端：http://localhost:8080
- 后端 API：http://localhost:8000/docs

## 默认账号

首次启动后会自动创建管理员：

- 用户名：`admin`
- 密码：`admin123`

请登录后立即修改部署环境的账号密码或新增管理员并停用默认账号。

## 本地开发

后端：

```powershell
cd backend
pip install -r requirements.txt
$env:DATABASE_URL="sqlite:///./dev.db"
$env:DATA_DIR="./data"
uvicorn app.main:app --reload
```

前端：

```powershell
cd frontend
npm install
npm run dev
```

## 安全提醒

不要把真实 PaddleOCR Token 或 LLM API Key 提交到代码仓库。若密钥曾出现在聊天、文档或截图中，建议在对应平台轮换。
