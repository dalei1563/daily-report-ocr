import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
  theme,
} from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileSearchOutlined,
  HolderOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd';
import 'antd/dist/reset.css';
import './styles.css';
import { api } from './api';
import type { RecordDetail, RecordList, StructuredResult, Template, TemplateField, User } from './types';

type FlatData = { columns: { code: string; name: string }[]; rows: Record<string, unknown>[] };
type NavKey = 'ocr' | 'data';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function readApiError(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join('；');
  return fallback;
}

const datePresets = [
  ['all', '全部'],
  ['today', '当天'],
  ['7', '近7天'],
  ['15', '近15天'],
  ['30', '近30天'],
];

const statusMeta: Record<string, { color: string; label: string }> = {
  uploaded: { color: 'default', label: '已上传' },
  recognizing: { color: 'processing', label: '识别中' },
  needs_review: { color: 'warning', label: '待校对' },
  confirmed: { color: 'success', label: '已入库' },
  failed: { color: 'error', label: '失败' },
};

function removeEmptyRows(data: StructuredResult): StructuredResult {
  return {
    ...data,
    rows: (data.rows || []).filter((row) => Object.values(row).some((value) => String(value ?? '').trim())),
  };
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function StatusTag({ status }: { status: string }) {
  const meta = statusMeta[status] || { color: 'default', label: status };
  return <Tag color={meta.color} className="status-tag">{meta.label}</Tag>;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand-mark compact' : 'brand-mark'}>
      <span className="logo-box"><FileSearchOutlined /></span>
      <span>日报表 OCR</span>
    </div>
  );
}

function MetricTile({ icon, label, value, caption }: { icon: React.ReactNode; label: string; value: React.ReactNode; caption: string }) {
  return (
    <div className="metric-tile">
      <div className="metric-icon">{icon}</div>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className="metric-caption">{caption}</div>
      </div>
    </div>
  );
}

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="page-intro">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <Typography.Title level={1}>{title}</Typography.Title>
        <Typography.Text>{description}</Typography.Text>
      </div>
      {action ? <div className="page-intro-action">{action}</div> : null}
    </section>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const remembered = localStorage.getItem('rememberLogin') === 'true';

  async function submit(values: { username: string; password: string; remember?: boolean }) {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', values);
      localStorage.setItem('token', res.data.access_token);
      if (values.remember) {
        localStorage.setItem('rememberLogin', 'true');
        localStorage.setItem('rememberUsername', values.username);
        localStorage.setItem('rememberPassword', values.password);
      } else {
        localStorage.removeItem('rememberLogin');
        localStorage.removeItem('rememberUsername');
        localStorage.removeItem('rememberPassword');
      }
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <section className="login-hero">
        <div className="login-copy">
          <BrandMark />
          <Typography.Title level={1}>把手写日报表变成可管理的数据</Typography.Title>
          <Typography.Text>
            上传、识别、校对、入库和导出都在同一个工作台完成，适合本地部署的供应商日报表流程。
          </Typography.Text>
          <div className="login-preview" aria-hidden="true">
            <div className="preview-toolbar">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-grid">
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
          </div>
        </div>
        <Card className="login-card">
          <div className="form-title">
            <Typography.Title level={2}>登录工作台</Typography.Title>
            <Typography.Text>使用管理员或日报录入账号继续</Typography.Text>
          </div>
          <Form
            layout="vertical"
            onFinish={submit}
            initialValues={{
              username: remembered ? localStorage.getItem('rememberUsername') || '' : '',
              password: remembered ? localStorage.getItem('rememberPassword') || '' : '',
              remember: remembered,
            }}
          >
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input size="large" autoComplete="username" placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" autoComplete="current-password" placeholder="请输入密码" />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>记住密码</Checkbox>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              登录
            </Button>
          </Form>
        </Card>
      </section>
    </main>
  );
}

function BindTemplateModal({ open, templates, onBound }: { open: boolean; templates: Template[]; onBound: (user: User) => void }) {
  const [value, setValue] = useState<number>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!value && templates.length) setValue(templates[0].id);
  }, [templates, value]);

  async function bind() {
    if (!value) return message.warning('请选择一个模板');
    setSaving(true);
    try {
      const res = await api.put('/users/me/template', { template_id: value });
      message.success('模板已绑定');
      onBound(res.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} closable={false} maskClosable={false} title="绑定日报表模板" footer={null} width={480}>
      <Space direction="vertical" className="full" size="middle">
        <Alert type="warning" showIcon message="所有用户必须绑定一种模板后才能使用 OCR 和数据管理。" />
        <Select
          size="large"
          value={value}
          onChange={setValue}
          options={templates.map((item) => ({ label: item.name, value: item.id }))}
          placeholder="选择模板"
        />
        <Button type="primary" block size="large" loading={saving} onClick={bind}>
          确认绑定
        </Button>
      </Space>
    </Modal>
  );
}

function ProgressOverlay({ open, completed, total, onCancel }: { open: boolean; completed: number; total: number; onCancel: () => void }) {
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return (
    <Modal open={open} footer={null} closable={false} centered width={560} className="progress-modal">
      <div className="progress-content">
        <div className="progress-spinner">
          <Spin size="large" />
        </div>
        <Typography.Title level={3}>正在批量识别</Typography.Title>
        <Typography.Text type="secondary">图片会先进行 OCR，再由 AI 抽取为结构化日报表数据。</Typography.Text>
        <div className="batch-progress">
          <div className="progress-number">{completed}/{total}</div>
          <Progress percent={percent} showInfo={false} strokeColor="#1e40af" trailColor="#dbeafe" />
        </div>
        <div className="progress-note">
          <CheckCircleOutlined />
          <span>单次最多上传 5 张，完成后统一进入校对区。</span>
        </div>
        <Button icon={<CloseOutlined />} block onClick={onCancel}>
          取消识别
        </Button>
      </div>
    </Modal>
  );
}

function UploadPanel({
  boundTemplate,
  currentUser,
  onOpenAdmin,
  onRecognized,
}: {
  boundTemplate: Template;
  currentUser: User;
  onOpenAdmin: () => void;
  onRecognized: (details: RecordDetail[]) => void;
}) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);

  async function start() {
    if (!fileList.length) return message.warning('请先上传报表图片');
    const readiness = (await api.get('/settings/readiness')).data;
    if (!readiness.ready) {
      if (currentUser.role === 'admin') {
        Modal.confirm({
          title: '请先配置识别密钥',
          content: `缺少：${readiness.missing.join('、')}`,
          okText: '去配置',
          cancelText: '取消',
          onOk: onOpenAdmin,
        });
      } else {
        message.warning('请联系管理员配置识别密钥');
      }
      return;
    }
    setBusy(true);
    setCompleted(0);
    const details: RecordDetail[] = [];
    try {
      await Promise.all(fileList.map(async (file) => {
        const form = new FormData();
        form.append('file', file.originFileObj as File);
        const uploaded = await api.post('/records/upload', form);
        await api.post(`/records/${uploaded.data.id}/recognize`);
        while (true) {
          const progress = (await api.get(`/records/${uploaded.data.id}/progress`)).data;
          if (progress.status === 'failed') {
            message.error(`${file.name}: ${progress.error_message || '识别失败'}`);
            setCompleted((value) => value + 1);
            break;
          }
          if (progress.status === 'needs_review' || progress.status === 'confirmed') {
            const detail = (await api.get(`/records/${uploaded.data.id}`)).data;
            if (!detail.result) {
              message.warning(`${file.name}: 识别完成，但没有返回结构化结果`);
              setCompleted((value) => value + 1);
              break;
            }
            details.push(detail);
            setCompleted((value) => value + 1);
            break;
          }
          await wait(2000);
        }
      }));
      if (details.length) {
        onRecognized(details);
        message.success(`识别完成 ${details.length} 张，请校对后提交入库`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="work-card upload-card">
      <div className="card-heading">
        <div>
          <Typography.Title level={2}>上传日报表</Typography.Title>
          <Typography.Text>支持图片和 PDF，单次最多 5 张。请尽量使用清晰、光线均匀的报表照片。</Typography.Text>
        </div>
        <Tag color="blue">模板：{boundTemplate.name}</Tag>
      </div>

      <div className="upload-layout">
        <div className="upload-zone">
          <Upload
            accept="image/*,.pdf"
            listType="picture-card"
            multiple
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: list }) => {
              if (list.length > 5) message.warning('单次最多上传 5 张图片');
              setFileList(list.slice(0, 5));
            }}
            className="big-uploader"
          >
            <div className="upload-plus">
              <CloudUploadOutlined />
              <span>选择报表文件</span>
              <small>图片 / PDF</small>
            </div>
          </Upload>
        </div>

        <aside className="upload-aside">
          <div className="pipeline-title">识别流程</div>
          <div className="pipeline-step active">
            <span>01</span>
            <div>
              <strong>上传原始报表</strong>
              <p>保留文件并生成识别任务</p>
            </div>
          </div>
          <div className="pipeline-step">
            <span>02</span>
            <div>
              <strong>OCR + AI 结构化</strong>
              <p>抽取表头与明细字段</p>
            </div>
          </div>
          <div className="pipeline-step">
            <span>03</span>
            <div>
              <strong>人工校对入库</strong>
              <p>确认后进入数据管理</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="upload-actions">
        <Button type="primary" icon={<RobotOutlined />} size="large" onClick={start} loading={busy} disabled={!fileList.length}>
          {fileList.length ? `开始识别 ${fileList.length} 张` : '开始识别'}
        </Button>
        <Button icon={<ReloadOutlined />} size="large" onClick={() => setFileList([])} disabled={!fileList.length || busy}>
          清空
        </Button>
      </div>
      <ProgressOverlay open={busy} completed={completed} total={fileList.length} onCancel={() => setBusy(false)} />
    </Card>
  );
}

function ReviewResult({ detail, index, total, onSubmitted }: { detail: RecordDetail; index?: number; total?: number; onSubmitted: () => void }) {
  const [data, setData] = useState<StructuredResult>(detail.result || { header: {}, rows: [], warnings: [] });
  const [saving, setSaving] = useState(false);
  const headerFields = detail.template.fields.filter((field) => field.area === 'header').sort((a, b) => a.sort_order - b.sort_order);
  const tableFields = detail.template.fields.filter((field) => field.area === 'table').sort((a, b) => a.sort_order - b.sort_order);

  async function submit() {
    setSaving(true);
    try {
      const cleaned = removeEmptyRows(data);
      setData(cleaned);
      await api.put(`/records/${detail.id}/correct`, { corrected: cleaned, confirm: true });
      message.success('已提交入库');
      onSubmitted();
    } finally {
      setSaving(false);
    }
  }

  function updateHeader(code: string, value: string) {
    setData((current) => ({ ...current, header: { ...current.header, [code]: value } }));
  }

  function updateRow(rowIndex: number, code: string, value: string) {
    setData((current) => {
      const rows = [...current.rows];
      rows[rowIndex] = { ...rows[rowIndex], [code]: value };
      return { ...current, rows };
    });
  }

  function removeRow(rowIndex: number) {
    setData((current) => ({ ...current, rows: current.rows.filter((_, i) => i !== rowIndex) }));
  }

  return (
    <Card className="work-card result-card">
      <div className="card-heading">
        <div>
          <Typography.Title level={2}>校对识别结果{total && total > 1 ? ` ${index}/${total}` : ''}</Typography.Title>
          <Typography.Text>检查表头和明细，确认无误后提交入库。</Typography.Text>
        </div>
        <StatusTag status={detail.status} />
      </div>

      {data.warnings?.length ? (
        <Alert className="warning-alert" type="warning" showIcon message={data.warnings.join('；')} />
      ) : null}

      <section className="header-form">
        <div className="subsection-title">报表信息</div>
        <div className="field-grid">
          {headerFields.map((field) => (
            <Form.Item key={field.code} label={<FieldLabel field={field} />}>
              <Input
                value={String(data.header[field.code] ?? '')}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateHeader(field.code, event.target.value)}
              />
            </Form.Item>
          ))}
        </div>
      </section>

      <section className="review-table-section">
        <div className="subsection-title">明细数据</div>
        <div className="table-shell desktop-table">
          <Table<Record<string, unknown>>
            rowKey={(_, rowIndex) => String(rowIndex)}
            dataSource={data.rows}
            pagination={false}
            scroll={{ x: 'max-content' }}
            columns={[
              ...tableFields.map((field) => ({
                title: <FieldLabel field={field} />,
                dataIndex: field.code,
                width: 190,
                render: (_: unknown, row: Record<string, unknown>, rowIndex: number) => (
                  <Input
                    value={String(row[field.code] ?? '')}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateRow(rowIndex, field.code, event.target.value)}
                  />
                ),
              })),
              {
                title: '',
                width: 72,
                fixed: 'right' as const,
                render: (_: unknown, __: Record<string, unknown>, rowIndex: number) => (
                  <Button icon={<DeleteOutlined />} onClick={() => removeRow(rowIndex)} aria-label="删除行" />
                ),
              },
            ]}
          />
        </div>

        <div className="mobile-row-list">
          {data.rows.length ? data.rows.map((row, rowIndex) => (
            <div className="mobile-row-card" key={String(rowIndex)}>
              <div className="mobile-row-head">
                <strong>明细 {rowIndex + 1}</strong>
                <Button icon={<DeleteOutlined />} onClick={() => removeRow(rowIndex)} aria-label="删除行" />
              </div>
              {tableFields.map((field) => (
                <Form.Item key={field.code} label={<FieldLabel field={field} />}>
                  <Input
                    value={String(row[field.code] ?? '')}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateRow(rowIndex, field.code, event.target.value)}
                  />
                </Form.Item>
              ))}
            </div>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细行" />}
        </div>
      </section>

      <div className="submit-row">
        <Button icon={<PlusOutlined />} onClick={() => setData((current) => ({ ...current, rows: [...current.rows, {}] }))}>
          新增行
        </Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={submit}>
          提交入库
        </Button>
      </div>
    </Card>
  );
}

function FieldLabel({ field }: { field: TemplateField }) {
  return <span className={field.required ? 'field-hot' : ''}>{field.name}{field.required ? ' *' : ''}</span>;
}

function OcrPage({
  boundTemplate,
  currentUser,
  onOpenAdmin,
  onStored,
}: {
  boundTemplate: Template;
  currentUser: User;
  onOpenAdmin: () => void;
  onStored: () => void;
}) {
  const [details, setDetails] = useState<RecordDetail[]>([]);

  return (
    <main className="page">
      <PageIntro
        eyebrow="OCR 工作台"
        title="上传日报表，校对后直接入库"
        description="面向本地部署的手写日报表识别流程，重点优化批量上传、结构化校对和数据归档。"
      />

      <div className="metrics-grid">
        <MetricTile icon={<FileSearchOutlined />} label="当前模板" value={boundTemplate.name} caption={`${boundTemplate.fields.length} 个字段`} />
        <MetricTile icon={<RobotOutlined />} label="识别队列" value={details.length ? `${details.length} 张` : '空闲'} caption="识别后在下方校对" />
        <MetricTile icon={<CheckCircleOutlined />} label="提交方式" value="人工确认" caption="降低误入库风险" />
      </div>

      <UploadPanel boundTemplate={boundTemplate} currentUser={currentUser} onOpenAdmin={onOpenAdmin} onRecognized={setDetails} />
      {details.map((detail, index) => (
        <ReviewResult
          key={detail.id}
          detail={detail}
          index={index + 1}
          total={details.length}
          onSubmitted={() => {
            setDetails((items) => items.filter((item) => item.id !== detail.id));
            if (details.length <= 1) onStored();
          }}
        />
      ))}
    </main>
  );
}

function RecordMobileCard({ record, onView }: { record: RecordList; onView: (id: number) => void }) {
  return (
    <article className="record-mobile-card">
      <div>
        <strong>{record.original_filename || `记录 #${record.id}`}</strong>
        <span>{formatDateTime(record.created_at)}</span>
      </div>
      <StatusTag status={record.status} />
      <Button icon={<EyeOutlined />} onClick={() => onView(record.id)}>
        查看详情
      </Button>
    </article>
  );
}

function DataManage({ refreshKey, onView }: { refreshKey: number; onView: (id: number) => void }) {
  const [records, setRecords] = useState<RecordList[]>([]);
  const [flat, setFlat] = useState<FlatData>({ columns: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [dateMode, setDateMode] = useState('all');

  async function load() {
    setLoading(true);
    try {
      const [recordRes, flatRes] = await Promise.all([api.get('/records'), api.get('/records/flat')]);
      setRecords(recordRes.data);
      setFlat(flatRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [refreshKey]);

  async function exportExcel() {
    const res = await api.post('/records/export', {}, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr_export.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredRows = useMemo(() => {
    if (dateMode === 'all') return flat.rows;
    const days = dateMode === 'today' ? 1 : Number(dateMode);
    const start = Date.now() - days * 24 * 60 * 60 * 1000;
    return flat.rows.filter((row) => new Date(String(row.created_at)).getTime() >= start);
  }, [dateMode, flat.rows]);

  const confirmedCount = records.filter((item) => item.status === 'confirmed').length;
  const pendingCount = records.filter((item) => item.status === 'needs_review' || item.status === 'recognizing').length;

  return (
    <main className="page">
      <PageIntro
        eyebrow="数据管理"
        title="查看记录，筛选日报，导出 Excel"
        description="集中管理已上传的报表记录和结构化明细，移动端也能快速查看状态。"
        action={<Button type="primary" icon={<DownloadOutlined />} onClick={exportExcel}>导出全部数据</Button>}
      />

      <div className="metrics-grid">
        <MetricTile icon={<DatabaseOutlined />} label="上传记录" value={records.length} caption="全部批次" />
        <MetricTile icon={<CheckCircleOutlined />} label="已入库" value={confirmedCount} caption="确认完成" />
        <MetricTile icon={<RobotOutlined />} label="处理中" value={pendingCount} caption="识别或待校对" />
      </div>

      <Tabs
        className="data-tabs"
        items={[
          {
            key: 'records',
            label: '上传记录',
            children: (
              <Card className="work-card">
                <div className="card-heading">
                  <div>
                    <Typography.Title level={2}>上传记录</Typography.Title>
                    <Typography.Text>共 {records.length} 条记录</Typography.Text>
                  </div>
                  <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
                </div>
                <div className="table-shell desktop-table">
                  <Table<RecordList>
                    rowKey="id"
                    loading={loading}
                    dataSource={records}
                    scroll={{ x: 760 }}
                    columns={[
                      { title: '报表日期', render: (_: unknown, row: RecordList) => <Space><CalendarOutlined />{formatDate(row.created_at)}</Space> },
                      { title: '文件名', dataIndex: 'original_filename', ellipsis: true },
                      { title: '模板', dataIndex: 'template_name' },
                      { title: '录入人', dataIndex: 'username' },
                      { title: '录入时间', dataIndex: 'created_at', render: (value: string) => formatDateTime(value) },
                      { title: '状态', dataIndex: 'status', render: (value: string) => <StatusTag status={value} /> },
                      { title: '操作', width: 120, fixed: 'right', render: (_: unknown, row: RecordList) => <Button type="link" icon={<EyeOutlined />} onClick={() => onView(row.id)}>查看</Button> },
                    ]}
                  />
                </div>
                <div className="record-mobile-list">
                  {records.length ? records.map((record) => <RecordMobileCard key={record.id} record={record} onView={onView} />) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无上传记录" />
                  )}
                </div>
              </Card>
            ),
          },
          {
            key: 'flat',
            label: '报表数据',
            children: (
              <>
                <Card className="work-card date-filter">
                  <div className="filter-row">
                    <div>
                      <Typography.Title level={2}>日期筛选</Typography.Title>
                      <Typography.Text>当前显示 {filteredRows.length} 条结构化明细</Typography.Text>
                    </div>
                    <div className="filter-buttons">
                      {datePresets.map(([key, label]) => (
                        <Button key={key} type={dateMode === key ? 'primary' : 'default'} onClick={() => setDateMode(key)}>
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card className="work-card">
                  <div className="card-heading">
                    <div>
                      <Typography.Title level={2}>报表明细</Typography.Title>
                      <Typography.Text>宽表格在手机端可横向滑动查看</Typography.Text>
                    </div>
                  </div>
                  <div className="table-shell">
                    <Table<Record<string, unknown>>
                      rowKey={(row, rowIndex) => `${row.record_id ?? 'record'}-${row.row_index ?? rowIndex}`}
                      loading={loading}
                      dataSource={filteredRows}
                      scroll={{ x: 'max-content', y: 560 }}
                      columns={flat.columns.map((col) => ({
                        title: col.name,
                        dataIndex: col.code,
                        width: col.code.includes('time') ? 180 : 140,
                        render: (value: unknown) => String(value ?? ''),
                      }))}
                    />
                  </div>
                </Card>
              </>
            ),
          },
        ]}
      />
    </main>
  );
}

function AdminConsole({
  open,
  onClose,
  templates,
  reloadTemplates,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  templates: Template[];
  reloadTemplates: () => void;
  currentUser: User;
}) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1120} title="管理员控制台" className="admin-modal">
      <Tabs
        className="admin-tabs"
        items={[
          { key: 'templates', label: '模板配置', children: <Templates templates={templates} reload={reloadTemplates} /> },
          { key: 'users', label: '账号管理', children: <Users templates={templates} currentUser={currentUser} /> },
          { key: 'settings', label: '模型配置', children: <Settings /> },
        ]}
      />
    </Modal>
  );
}

function Templates({ templates, reload }: { templates: Template[]; reload: () => void }) {
  const [editing, setEditing] = useState<Template | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [form] = Form.useForm();

  function start(template?: Template) {
    const next = template || { id: 0, name: '', description: '', is_default: false, is_active: true, fields: [] };
    setEditing(next);
    form.setFieldsValue(next);
  }

  async function save(values: Template) {
    const payload = {
      ...values,
      is_active: true,
      fields: (values.fields || []).map((field, index) => ({
        ...field,
        code: `key${index + 1}`,
        sort_order: index + 1,
        aliases: field.aliases || [],
      })),
    };
    if (editing?.id) await api.put(`/templates/${editing.id}`, payload);
    else await api.post('/templates', payload);
    setEditing(null);
    reload();
  }

  return (
    <section>
      <div className="admin-section-head">
        <div>
          <Typography.Title level={3}>模板配置</Typography.Title>
          <Typography.Text>定义表头和明细字段，用户绑定模板后即可识别。</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => start()}>新建模板</Button>
      </div>
      <div className="table-shell">
        <Table<Template> className="admin-table" rowKey="id" dataSource={templates} scroll={{ x: 640 }} columns={[
          { title: '模板名称', dataIndex: 'name' },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          { title: '字段数', render: (_: unknown, row: Template) => row.fields.length },
          { title: '默认', dataIndex: 'is_default', render: (value: boolean) => value ? <Tag color="green">默认</Tag> : '-' },
          { title: '操作', width: 120, render: (_: unknown, row: Template) => <Button icon={<SettingOutlined />} onClick={() => start(row)}>配置</Button> },
        ]} />
      </div>
      <Modal open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} width={960} title="模板配置" className="template-modal">
        <Form form={form} layout="vertical" onFinish={save}>
          <div className="settings-grid">
            <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}><Input /></Form.Item>
            <Form.Item name="is_default" label="默认模板"><Select options={[{ label: '否', value: false }, { label: '是', value: true }]} /></Form.Item>
          </div>
          <Form.Item name="description" label="描述"><Input /></Form.Item>
          <Form.List name="fields">
            {(fields, { add, remove, move }) => (
              <Space direction="vertical" className="full">
                <Button icon={<PlusOutlined />} onClick={() => add({ name: '', field_type: 'text', area: 'table', required: false, aliases: [] })}>添加字段</Button>
                {fields.map((field, index) => (
                  <div
                    key={field.key}
                    className="template-field-row"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex === null || dragIndex === index) return;
                      move(dragIndex, index);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <div className="drag-handle" draggable onDragStart={() => setDragIndex(index)}><HolderOutlined /> key{index + 1}</div>
                    <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true, message: '请输入字段名称' }]}><Input placeholder="字段名称" /></Form.Item>
                    <Form.Item {...field} name={[field.name, 'area']}><Select options={[{ label: '表头', value: 'header' }, { label: '明细', value: 'table' }]} /></Form.Item>
                    <Form.Item {...field} name={[field.name, 'field_type']}><Select options={[{ label: '文本', value: 'text' }, { label: '数字', value: 'number' }, { label: '日期', value: 'date' }]} /></Form.Item>
                    <Form.Item {...field} name={[field.name, 'required']}><Select options={[{ label: '非必填', value: false }, { label: '必填', value: true }]} /></Form.Item>
                    <Button icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label="删除字段" />
                  </div>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </section>
  );
}

function Users({ templates, currentUser }: { templates: Template[]; currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);

  async function load() { setUsers((await api.get('/users')).data); }
  useEffect(() => { load(); }, []);

  async function create(values: { username: string; password: string; role: string; bound_template_id?: number }) {
    try {
      await api.post('/users', values);
      message.success('账号已创建');
      form.resetFields();
      load();
    } catch (error) {
      message.error(readApiError(error, '创建账号失败'));
    }
  }

  async function bind(user: User, templateId: number) {
    await updateUser(user.id, { bound_template_id: templateId }, '模板已更新');
  }

  async function changeRole(user: User, role: string) {
    await updateUser(user.id, { role }, '角色已更新');
  }

  async function updateStatus(user: User, isActive: boolean) {
    await runUserAction(user.id, async () => {
      await api.patch(`/users/${user.id}/status`, { is_active: isActive });
      message.success(isActive ? '账号已启用' : '账号已停用');
      await load();
    });
  }

  async function updateUser(userId: number, payload: Record<string, unknown>, successMessage: string) {
    await runUserAction(userId, async () => {
      await api.put(`/users/${userId}`, payload);
      message.success(successMessage);
      await load();
    });
  }

  async function runUserAction(userId: number, action: () => Promise<void>) {
    setSavingUserId(userId);
    try {
      await action();
    } catch (error) {
      message.error(readApiError(error, '操作失败'));
    } finally {
      setSavingUserId(null);
    }
  }

  async function resetPassword(values: { password: string }) {
    if (!resettingUser) return;
    await runUserAction(resettingUser.id, async () => {
      await api.post(`/users/${resettingUser.id}/reset-password`, { password: values.password });
      message.success('密码已重置');
      setResettingUser(null);
      resetForm.resetFields();
      await load();
    });
  }

  function confirmDelete(user: User) {
    Modal.confirm({
      title: '删除账号',
      content: `确定删除账号「${user.username}」吗？删除后该账号无法登录，也不会出现在账号列表中。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => runUserAction(user.id, async () => {
        await api.delete(`/users/${user.id}`);
        message.success('账号已删除');
        await load();
      }),
    });
  }

  return (
    <section>
      <div className="admin-section-head">
        <div>
          <Typography.Title level={3}>账号管理</Typography.Title>
          <Typography.Text>创建账号、调整角色与模板，并完成启停、重置密码和删除。</Typography.Text>
        </div>
      </div>
      <Form form={form} layout="inline" onFinish={create} className="user-form">
        <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}><Input placeholder="用户名" /></Form.Item>
        <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}><Input.Password placeholder="密码" /></Form.Item>
        <Form.Item name="role" initialValue="user"><Select options={[{ label: '用户', value: 'user' }, { label: '管理员', value: 'admin' }]} /></Form.Item>
        <Form.Item name="bound_template_id" rules={[{ required: true, message: '请选择模板' }]}>
          <Select placeholder="绑定模板" options={templates.map((item) => ({ label: item.name, value: item.id }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<TeamOutlined />}>创建账号</Button>
      </Form>
      <div className="table-shell">
        <Table<User> rowKey="id" dataSource={users} scroll={{ x: 980 }} columns={[
          { title: '用户名', dataIndex: 'username' },
          {
            title: '角色',
            dataIndex: 'role',
            width: 140,
            render: (value: string, row: User) => (
              <Select
                value={value}
                disabled={row.id === currentUser.id || savingUserId === row.id}
                options={[{ label: '用户', value: 'user' }, { label: '管理员', value: 'admin' }]}
                onChange={(next) => changeRole(row, next)}
              />
            ),
          },
          {
            title: '绑定模板',
            dataIndex: 'bound_template_id',
            width: 220,
            render: (value: number | undefined, row: User) => (
              <Select
                className="template-select"
                value={value || undefined}
                placeholder="未绑定"
                disabled={savingUserId === row.id}
                options={templates.map((item) => ({ label: item.name, value: item.id }))}
                onChange={(next) => bind(row, next)}
              />
            ),
          },
          {
            title: '状态',
            dataIndex: 'is_active',
            width: 100,
            render: (value: boolean) => value ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
          },
          {
            title: '操作',
            fixed: 'right',
            width: 280,
            render: (_: unknown, row: User) => {
              const isSelf = row.id === currentUser.id;
              return (
                <Space className="account-actions" size={8} wrap>
                  <Button
                    icon={row.is_active ? <CloseOutlined /> : <CheckCircleOutlined />}
                    disabled={isSelf}
                    loading={savingUserId === row.id}
                    onClick={() => updateStatus(row, !row.is_active)}
                  >
                    {row.is_active ? '停用' : '启用'}
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={savingUserId === row.id}
                    onClick={() => setResettingUser(row)}
                  >
                    重置密码
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    disabled={isSelf}
                    loading={savingUserId === row.id}
                    onClick={() => confirmDelete(row)}
                  >
                    删除
                  </Button>
                </Space>
              );
            },
          },
        ]} />
      </div>
      <Modal
        open={Boolean(resettingUser)}
        title={`重置密码${resettingUser ? `：${resettingUser.username}` : ''}`}
        onCancel={() => { setResettingUser(null); resetForm.resetFields(); }}
        onOk={() => resetForm.submit()}
        okText="确认重置"
        cancelText="取消"
        confirmLoading={Boolean(resettingUser && savingUserId === resettingUser.id)}
      >
        <Form form={resetForm} layout="vertical" onFinish={resetPassword}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder="请输入新密码" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

function Settings() {
  const [form] = Form.useForm();
  const [settingsState, setSettingsState] = useState<{
    has_paddle_ocr_token?: boolean;
    has_llm_api_key?: boolean;
    paddle_ocr_token_masked?: string;
    llm_api_key_masked?: string;
  }>({});

  async function load() {
    const res = await api.get('/settings/models');
    setSettingsState(res.data);
    form.setFieldsValue({
      paddle_ocr_job_url: res.data.paddle_ocr_job_url,
      paddle_ocr_model: res.data.paddle_ocr_model,
      llm_base_url: res.data.llm_base_url,
      llm_model: res.data.llm_model,
      paddle_ocr_token: res.data.has_paddle_ocr_token ? '*********' : '',
      llm_api_key: res.data.has_llm_api_key ? '*********' : '',
    });
  }

  useEffect(() => { load(); }, [form]);

  async function save(values: Record<string, unknown>) {
    const payload = {
      paddle_ocr_job_url: values.paddle_ocr_job_url,
      paddle_ocr_model: values.paddle_ocr_model,
      llm_base_url: values.llm_base_url,
      llm_model: values.llm_model,
      paddle_ocr_token: values.paddle_ocr_token && values.paddle_ocr_token !== '*********' ? values.paddle_ocr_token : undefined,
      llm_api_key: values.llm_api_key && values.llm_api_key !== '*********' ? values.llm_api_key : undefined,
    };
    const res = await api.put('/settings/models', payload);
    setSettingsState(res.data);
    form.setFieldsValue({
      paddle_ocr_token: res.data.has_paddle_ocr_token ? '*********' : '',
      llm_api_key: res.data.has_llm_api_key ? '*********' : '',
    });
    message.success('已保存识别配置');
  }

  async function clearSecret(type: 'paddle' | 'llm') {
    const payload = type === 'paddle' ? { clear_paddle_ocr_token: true } : { clear_llm_api_key: true };
    const res = await api.put('/settings/models', payload);
    setSettingsState(res.data);
    form.setFieldsValue(type === 'paddle' ? { paddle_ocr_token: '' } : { llm_api_key: '' });
    message.success('已清空密钥');
  }

  return (
    <section>
      <div className="admin-section-head">
        <div>
          <Typography.Title level={3}>模型配置</Typography.Title>
          <Typography.Text>配置 OCR 与大模型服务，密钥仅显示掩码。</Typography.Text>
        </div>
      </div>
      <Form form={form} layout="vertical" onFinish={save} className="settings-form">
        <div className="settings-grid">
          <Form.Item name="paddle_ocr_job_url" label="PaddleOCR Job URL"><Input /></Form.Item>
          <Form.Item name="paddle_ocr_model" label="PaddleOCR 模型"><Input /></Form.Item>
        </div>
        <Form.Item label={`PaddleOCR 密钥 ${settingsState.has_paddle_ocr_token ? `(${settingsState.paddle_ocr_token_masked})` : '(未配置)'}`}>
          <Space.Compact className="full">
            <Form.Item name="paddle_ocr_token" noStyle>
              <Input.Password
                placeholder={settingsState.has_paddle_ocr_token ? '已配置，输入新密钥可覆盖' : '请输入 PaddleOCR 密钥'}
                autoComplete="new-password"
                onFocus={(event: React.FocusEvent<HTMLInputElement>) => {
                  if (event.target.value === '*********') form.setFieldsValue({ paddle_ocr_token: '' });
                }}
              />
            </Form.Item>
            <Button danger onClick={() => clearSecret('paddle')} disabled={!settingsState.has_paddle_ocr_token}>清空</Button>
          </Space.Compact>
        </Form.Item>
        <div className="settings-grid">
          <Form.Item name="llm_base_url" label="OpenAI Base URL"><Input /></Form.Item>
          <Form.Item name="llm_model" label="LLM 模型"><Input /></Form.Item>
        </div>
        <Form.Item label={`大模型密钥 ${settingsState.has_llm_api_key ? `(${settingsState.llm_api_key_masked})` : '(未配置)'}`}>
          <Space.Compact className="full">
            <Form.Item name="llm_api_key" noStyle>
              <Input.Password
                placeholder={settingsState.has_llm_api_key ? '已配置，输入新密钥可覆盖' : '请输入大模型密钥'}
                autoComplete="new-password"
                onFocus={(event: React.FocusEvent<HTMLInputElement>) => {
                  if (event.target.value === '*********') form.setFieldsValue({ llm_api_key: '' });
                }}
              />
            </Form.Item>
            <Button danger onClick={() => clearSecret('llm')} disabled={!settingsState.has_llm_api_key}>清空</Button>
          </Space.Compact>
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>保存配置</Button>
      </Form>
    </section>
  );
}

function RecordViewModal({ id, onClose, onStored }: { id?: number; onClose: () => void; onStored: () => void }) {
  const [detail, setDetail] = useState<RecordDetail>();

  useEffect(() => {
    if (!id) return;
    setDetail(undefined);
    api.get(`/records/${id}`).then((res) => setDetail(res.data));
  }, [id]);

  return (
    <Modal open={Boolean(id)} onCancel={onClose} footer={null} width={980} title="报表详情" className="record-modal">
      {detail ? <ReviewResult detail={detail} onSubmitted={() => { onClose(); onStored(); }} /> : <div className="modal-loading"><Spin /></div>}
    </Modal>
  );
}

function NavButtons({ active, onChange }: { active: NavKey; onChange: (key: NavKey) => void }) {
  return (
    <nav className="main-nav">
      <Button type={active === 'ocr' ? 'primary' : 'text'} icon={<RobotOutlined />} onClick={() => onChange('ocr')}>OCR 识别</Button>
      <Button type={active === 'data' ? 'primary' : 'text'} icon={<AppstoreOutlined />} onClick={() => onChange('data')}>数据管理</Button>
    </nav>
  );
}

function Shell() {
  const [me, setMe] = useState<User | null>(null);
  const [active, setActive] = useState<NavKey>('ocr');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [recordId, setRecordId] = useState<number>();
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const boundTemplate = templates.find((item) => item.id === me?.bound_template_id);

  async function loadMe() { setMe((await api.get('/auth/me')).data); }
  async function loadTemplates() { setTemplates((await api.get('/templates')).data); }

  useEffect(() => { loadMe(); loadTemplates(); }, []);

  function changeNav(key: NavKey) {
    setActive(key);
    setMobileNavOpen(false);
  }

  return (
    <>
      <header className="top-nav">
        <BrandMark compact />
        <NavButtons active={active} onChange={changeNav} />
        <div className="nav-right">
          {me?.role === 'admin' ? <Button icon={<SettingOutlined />} onClick={() => setAdminOpen(true)}>管理员</Button> : null}
          <span className="account-name">{me?.username}</span>
          <Button icon={<LogoutOutlined />} onClick={() => { localStorage.removeItem('token'); location.reload(); }}>退出</Button>
        </div>
        <Button className="mobile-menu-button" icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} aria-label="打开菜单" />
      </header>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} placement="right" title={<BrandMark compact />}>
        <div className="drawer-nav">
          <NavButtons active={active} onChange={changeNav} />
          {me?.role === 'admin' ? <Button icon={<SettingOutlined />} onClick={() => { setAdminOpen(true); setMobileNavOpen(false); }}>管理员控制台</Button> : null}
          <Button icon={<LogoutOutlined />} onClick={() => { localStorage.removeItem('token'); location.reload(); }}>退出登录</Button>
        </div>
      </Drawer>

      {boundTemplate && me && active === 'ocr' ? (
        <OcrPage
          boundTemplate={boundTemplate}
          currentUser={me}
          onOpenAdmin={() => setAdminOpen(true)}
          onStored={() => setActive('data')}
        />
      ) : null}
      {boundTemplate && active === 'data' ? <DataManage refreshKey={dataRefreshKey} onView={setRecordId} /> : null}
      {!boundTemplate && me?.bound_template_id ? <div className="page"><Spin /></div> : null}
      <BindTemplateModal open={Boolean(me && !me.bound_template_id)} templates={templates} onBound={setMe} />
      {me ? (
        <AdminConsole
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          templates={templates}
          reloadTemplates={loadTemplates}
          currentUser={me}
        />
      ) : null}
      <RecordViewModal
        id={recordId}
        onClose={() => setRecordId(undefined)}
        onStored={() => setDataRefreshKey((value) => value + 1)}
      />
    </>
  );
}

function Root() {
  const [authed, setAuthed] = useState(Boolean(localStorage.getItem('token')));
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorPrimary: '#1e40af',
          colorInfo: '#2563eb',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorText: '#0f172a',
          colorTextSecondary: '#475569',
          colorBgLayout: '#f8fafc',
          fontFamily: '"Fira Sans", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Button: { controlHeight: 40, borderRadius: 6 },
          Input: { controlHeight: 40, borderRadius: 6 },
          Select: { controlHeight: 40, borderRadius: 6 },
          Card: { borderRadiusLG: 6 },
          Modal: { borderRadiusLG: 6 },
          Table: { headerBg: '#f8fafc', rowHoverBg: '#eff6ff' },
        },
      }}
    >
      <AntApp>{authed ? <Shell /> : <Login onDone={() => setAuthed(true)} />}</AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
