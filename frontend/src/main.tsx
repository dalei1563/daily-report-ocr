import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Form,
  Image,
  Input,
  Modal,
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
  CloseOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileSearchOutlined,
  HolderOutlined,
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

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function removeEmptyRows(data: StructuredResult): StructuredResult {
  return {
    ...data,
    rows: (data.rows || []).filter((row) => Object.values(row).some((value) => String(value ?? '').trim())),
  };
}

function StatusTag({ status }: { status: string }) {
  const color: Record<string, string> = {
    uploaded: 'default',
    recognizing: 'processing',
    needs_review: 'warning',
    confirmed: 'success',
    failed: 'error',
  };
  const label: Record<string, string> = {
    uploaded: '已上传',
    recognizing: '识别中',
    needs_review: '待校对',
    confirmed: '已入库',
    failed: '失败',
  };
  return <Tag color={color[status] || 'default'}>{label[status] || status}</Tag>;
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
    <div className="login">
      <Card className="login-card" title="手写报表OCR助手">
        <Form
          layout="vertical"
          onFinish={submit}
          initialValues={{
            username: remembered ? localStorage.getItem('rememberUsername') || '' : '',
            password: remembered ? localStorage.getItem('rememberPassword') || '' : '',
            remember: remembered,
          }}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>记住密码</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
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
    <Modal open={open} closable={false} maskClosable={false} title="绑定日报表模板" footer={null} width={460}>
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
  return (
    <Modal open={open} footer={null} closable={false} centered width={560} className="progress-modal">
      <div className="progress-content">
        <Spin size="large" />
        <Typography.Title level={3}>正在批量识别...</Typography.Title>
        <Typography.Text type="secondary">
          图片已上传至PaddleOCR进行文字识别，再由AI提取结构化数据
        </Typography.Text>
        <div className="batch-progress">
          <Typography.Title level={2}>识别进度（{completed}/{total}）</Typography.Title>
          <div className="batch-bar">
            <div style={{ width: total ? `${Math.round((completed / total) * 100)}%` : '0%' }} />
          </div>
        </div>
        <div className="progress-note">
          <div>系统会并行提交多张图片，每张图片独立完成 OCR 和 AI 结构化提取</div>
          <div>单次最多上传 5 张，完成后统一进入校对区</div>
        </div>
        <Button icon={<CloseOutlined />} block onClick={onCancel}>取消识别</Button>
      </div>
    </Modal>
  );
}

function UploadPanel({ boundTemplate, currentUser, onOpenAdmin, onRecognized }: { boundTemplate: Template; currentUser: User; onOpenAdmin: () => void; onRecognized: (details: RecordDetail[]) => void }) {
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
    <Card className="miao-card">
      <Typography.Title level={3}>上传报表图片</Typography.Title>
      <Typography.Text type="secondary">提示：确保图片清晰、光线充足，手写文字尽量工整，识别效果会更好</Typography.Text>
      <div className="upload-grid">
        <Upload
          accept="image/*,.pdf"
          listType="picture-card"
          multiple
          beforeUpload={() => false}
          fileList={fileList}
          onChange={({ fileList: list }) => {
            if (list.length > 5) message.warning('单次最多上传5张图片');
            setFileList(list.slice(0, 5));
          }}
          className="big-uploader"
        >
          <div className="upload-plus"><PlusOutlined /><span>点击上传</span></div>
        </Upload>
      </div>
      <div className="upload-actions">
        <Button type="primary" icon={<CloudUploadOutlined />} size="large" onClick={start} loading={busy} disabled={!fileList.length}>
          {fileList.length ? `开始识别（${fileList.length}张）` : '开始识别'}
        </Button>
        <Button icon={<ReloadOutlined />} size="large" onClick={() => setFileList([])}>清空</Button>
      </div>
      <div className="bound-template">当前绑定模板：{boundTemplate.name}</div>
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
  return (
    <Card className="miao-card result-card">
      <div className="section-head">
        <Typography.Title level={3}>识别结果{total && total > 1 ? `（${index}/${total}）` : ''}</Typography.Title>
        {data.warnings?.length ? <Typography.Text type="warning">{data.warnings.join('；')}</Typography.Text> : null}
      </div>
      <div className="header-form">
        <Typography.Text strong>报表信息</Typography.Text>
        <div className="field-grid">
          {headerFields.map((field) => (
            <Form.Item key={field.code} label={<FieldLabel field={field} />}>
              <Input value={String(data.header[field.code] ?? '')} onChange={(event) => setData({ ...data, header: { ...data.header, [field.code]: event.target.value } })} />
            </Form.Item>
          ))}
        </div>
      </div>
      <Table
        rowKey={(_, index) => String(index)}
        dataSource={data.rows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          ...tableFields.map((field) => ({
            title: <FieldLabel field={field} />,
            dataIndex: field.code,
            width: 190,
            render: (_: unknown, row: Record<string, unknown>, index: number) => (
              <Input
                value={String(row[field.code] ?? '')}
                onChange={(event) => {
                  const rows = [...data.rows];
                  rows[index] = { ...rows[index], [field.code]: event.target.value };
                  setData({ ...data, rows });
                }}
              />
            ),
          })),
          {
            title: '',
            width: 60,
            render: (_: unknown, __: unknown, index: number) => (
              <Button icon={<DeleteOutlined />} onClick={() => setData({ ...data, rows: data.rows.filter((_, i) => i !== index) })} />
            ),
          },
        ]}
      />
      <div className="submit-row">
        <Button icon={<PlusOutlined />} onClick={() => setData({ ...data, rows: [...data.rows, {}] })}>新增行</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={submit}>提交入库</Button>
      </div>
    </Card>
  );
}

function FieldLabel({ field }: { field: TemplateField }) {
  return <span className={field.required ? 'field-hot' : ''}>{field.name}{field.required ? ' *' : ''}</span>;
}

function OcrPage({ boundTemplate, currentUser, onOpenAdmin, onStored }: { boundTemplate: Template; currentUser: User; onOpenAdmin: () => void; onStored: () => void }) {
  const [details, setDetails] = useState<RecordDetail[]>([]);
  return (
    <main className="page">
      <Typography.Title>OCR识别</Typography.Title>
      <Typography.Text className="page-subtitle">上传手写报表图片，AI多模态直接识别并提取结构化数据</Typography.Text>
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

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <Typography.Title>数据管理</Typography.Title>
          <Typography.Text className="page-subtitle">查看和管理已录入的报表数据</Typography.Text>
        </div>
        <Button icon={<DownloadOutlined />} onClick={exportExcel}>导出全部数据</Button>
      </div>
      <Tabs
        className="data-tabs"
        items={[
          {
            key: 'records',
            label: '上传记录',
            children: (
              <Card className="miao-card" title={`上传记录（共 ${records.length} 条）`}>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={records}
                  columns={[
                    { title: '', width: 56, render: () => <Input type="checkbox" /> },
                    { title: '报表日期', render: (_, row) => <Space><CalendarOutlined />{new Date(row.created_at).toLocaleDateString()}</Space> },
                    { title: '录入时间', dataIndex: 'created_at', render: (value) => new Date(value).toLocaleString() },
                    { title: '状态', dataIndex: 'status', render: (value) => <StatusTag status={value} /> },
                    { title: '操作', width: 140, render: (_, row) => <Button type="link" icon={<EyeOutlined />} onClick={() => onView(row.id)}>查看</Button> },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'flat',
            label: '报表数据',
            children: (
              <>
                <Card className="miao-card date-filter" title="日期筛选">
                  <Space>
                    {[
                      ['all', '全部'],
                      ['today', '当天'],
                      ['7', '近7天'],
                      ['15', '近15天'],
                      ['30', '近30天'],
                    ].map(([key, label]) => (
                      <Button key={key} type={dateMode === key ? 'primary' : 'default'} onClick={() => setDateMode(key)}>{label}</Button>
                    ))}
                  </Space>
                </Card>
                <Card className="miao-card" title={`报表数据（共 ${filteredRows.length} 条）`}>
                  <Table
                    rowKey={(row) => `${row.record_id}-${row.row_index || Math.random()}`}
                    loading={loading}
                    dataSource={filteredRows}
                    scroll={{ x: 'max-content', y: 560 }}
                    columns={flat.columns.map((col) => ({
                      title: col.name,
                      dataIndex: col.code,
                      width: col.code.includes('time') ? 180 : 130,
                      render: (value) => String(value ?? ''),
                    }))}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </main>
  );
}

function AdminConsole({ open, onClose, templates, reloadTemplates }: { open: boolean; onClose: () => void; templates: Template[]; reloadTemplates: () => void }) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1080} title="管理员控制台">
      <Tabs
        items={[
          { key: 'templates', label: '模板配置', children: <Templates templates={templates} reload={reloadTemplates} /> },
          { key: 'users', label: '账号管理', children: <Users templates={templates} /> },
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
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => start()}>新建模板</Button>
      <Table className="admin-table" rowKey="id" dataSource={templates} columns={[
        { title: '模板名称', dataIndex: 'name' },
        { title: '字段数', render: (_, row) => row.fields.length },
        { title: '默认', dataIndex: 'is_default', render: (value) => value ? <Tag color="green">默认</Tag> : '-' },
        { title: '操作', render: (_, row) => <Button icon={<SettingOutlined />} onClick={() => start(row)}>配置</Button> },
      ]} />
      <Modal open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} width={960} title="模板配置">
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input /></Form.Item>
          <Form.Item name="is_default" label="默认模板"><Select options={[{ label: '否', value: false }, { label: '是', value: true }]} /></Form.Item>
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
                    <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true }]}><Input placeholder="字段名称" /></Form.Item>
                    <Form.Item {...field} name={[field.name, 'area']}><Select style={{ width: 110 }} options={[{ label: '表头', value: 'header' }, { label: '明细', value: 'table' }]} /></Form.Item>
                    <Form.Item {...field} name={[field.name, 'field_type']}><Select style={{ width: 110 }} options={[{ label: '文本', value: 'text' }, { label: '数字', value: 'number' }, { label: '日期', value: 'date' }]} /></Form.Item>
                    <Form.Item {...field} name={[field.name, 'required']}><Select style={{ width: 100 }} options={[{ label: '非必填', value: false }, { label: '必填', value: true }]} /></Form.Item>
                    <Button icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </div>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}

function Users({ templates }: { templates: Template[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [form] = Form.useForm();
  async function load() { setUsers((await api.get('/users')).data); }
  useEffect(() => { load(); }, []);
  async function create(values: { username: string; password: string; role: string; bound_template_id?: number }) {
    await api.post('/users', values);
    form.resetFields();
    load();
  }
  async function bind(user: User, templateId: number) {
    await api.put(`/users/${user.id}`, { bound_template_id: templateId });
    load();
  }
  return (
    <>
      <Form form={form} layout="inline" onFinish={create} className="user-form">
        <Form.Item name="username" rules={[{ required: true }]}><Input placeholder="用户名" /></Form.Item>
        <Form.Item name="password" rules={[{ required: true, min: 6 }]}><Input.Password placeholder="密码" /></Form.Item>
        <Form.Item name="role" initialValue="user"><Select style={{ width: 120 }} options={[{ label: '用户', value: 'user' }, { label: '管理员', value: 'admin' }]} /></Form.Item>
        <Form.Item name="bound_template_id" rules={[{ required: true, message: '请选择模板' }]}>
          <Select style={{ width: 180 }} placeholder="绑定模板" options={templates.map((item) => ({ label: item.name, value: item.id }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit">创建账号</Button>
      </Form>
      <Table rowKey="id" dataSource={users} columns={[
        { title: '用户名', dataIndex: 'username' },
        { title: '角色', dataIndex: 'role', render: (value) => value === 'admin' ? '管理员' : '用户' },
        {
          title: '绑定模板',
          dataIndex: 'bound_template_id',
          render: (value, row) => (
            <Select
              style={{ width: 220 }}
              value={value || undefined}
              placeholder="未绑定"
              options={templates.map((item) => ({ label: item.name, value: item.id }))}
              onChange={(next) => bind(row, next)}
            />
          ),
        },
        { title: '状态', dataIndex: 'is_active', render: (value) => value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
      ]} />
    </>
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
    <Form form={form} layout="vertical" onFinish={save}>
      <Form.Item name="paddle_ocr_job_url" label="PaddleOCR Job URL"><Input /></Form.Item>
      <Form.Item name="paddle_ocr_model" label="PaddleOCR 模型"><Input /></Form.Item>
      <Form.Item label={`PaddleOCR密钥 ${settingsState.has_paddle_ocr_token ? `(${settingsState.paddle_ocr_token_masked})` : '(未配置)'}`}>
        <Space.Compact className="full">
          <Form.Item name="paddle_ocr_token" noStyle>
            <Input.Password
              placeholder={settingsState.has_paddle_ocr_token ? '已配置，输入新密钥可覆盖' : '请输入PaddleOCR密钥'}
              autoComplete="new-password"
              onFocus={(event) => {
                if (event.target.value === '*********') form.setFieldsValue({ paddle_ocr_token: '' });
              }}
            />
          </Form.Item>
          <Button danger onClick={() => clearSecret('paddle')} disabled={!settingsState.has_paddle_ocr_token}>清空</Button>
        </Space.Compact>
      </Form.Item>
      <Form.Item name="llm_base_url" label="OpenAI Base URL"><Input /></Form.Item>
      <Form.Item name="llm_model" label="LLM 模型"><Input /></Form.Item>
      <Form.Item label={`大模型密钥 ${settingsState.has_llm_api_key ? `(${settingsState.llm_api_key_masked})` : '(未配置)'}`}>
        <Space.Compact className="full">
          <Form.Item name="llm_api_key" noStyle>
            <Input.Password
              placeholder={settingsState.has_llm_api_key ? '已配置，输入新密钥可覆盖' : '请输入大模型密钥'}
              autoComplete="new-password"
              onFocus={(event) => {
                if (event.target.value === '*********') form.setFieldsValue({ llm_api_key: '' });
              }}
            />
          </Form.Item>
          <Button danger onClick={() => clearSecret('llm')} disabled={!settingsState.has_llm_api_key}>清空</Button>
        </Space.Compact>
      </Form.Item>
      <Button type="primary" htmlType="submit">保存</Button>
    </Form>
  );
}

function RecordViewModal({ id, onClose, onStored }: { id?: number; onClose: () => void; onStored: () => void }) {
  const [detail, setDetail] = useState<RecordDetail>();
  useEffect(() => {
    if (!id) return;
    api.get(`/records/${id}`).then((res) => setDetail(res.data));
  }, [id]);
  return (
    <Modal open={Boolean(id)} onCancel={onClose} footer={null} width={980} title="报表详情">
      {detail ? <ReviewResult detail={detail} onSubmitted={() => { onClose(); onStored(); }} /> : <Spin />}
    </Modal>
  );
}

function Shell() {
  const [me, setMe] = useState<User | null>(null);
  const [active, setActive] = useState('ocr');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [recordId, setRecordId] = useState<number>();
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const boundTemplate = templates.find((item) => item.id === me?.bound_template_id);
  async function loadMe() { setMe((await api.get('/auth/me')).data); }
  async function loadTemplates() { setTemplates((await api.get('/templates')).data); }
  useEffect(() => { loadMe(); loadTemplates(); }, []);

  return (
    <>
      <header className="top-nav">
        <div className="brand-mark"><span className="logo-box" />手写报表OCR助手</div>
        <nav>
          <Button type={active === 'ocr' ? 'primary' : 'text'} icon={<RobotOutlined />} onClick={() => setActive('ocr')}>OCR识别</Button>
          <Button type={active === 'data' ? 'primary' : 'text'} icon={<AppstoreOutlined />} onClick={() => setActive('data')}>数据管理</Button>
        </nav>
        <div className="nav-right">
          {me?.role === 'admin' ? <Button type="primary" icon={<SettingOutlined />} onClick={() => setAdminOpen(true)}>管理员</Button> : null}
          <Typography.Text className="account-name">{me?.username}</Typography.Text>
          <Button type="text" onClick={() => { localStorage.removeItem('token'); location.reload(); }}>退出</Button>
        </div>
      </header>
      {boundTemplate && me && active === 'ocr' ? (
        <OcrPage
          boundTemplate={boundTemplate}
          currentUser={me}
          onOpenAdmin={() => setAdminOpen(true)}
          onStored={() => setActive('data')}
        />
      ) : null}
      {boundTemplate && active === 'data' ? <DataManage refreshKey={dataRefreshKey} onView={setRecordId} /> : null}
      <BindTemplateModal open={Boolean(me && !me.bound_template_id)} templates={templates} onBound={setMe} />
      <AdminConsole open={adminOpen} onClose={() => setAdminOpen(false)} templates={templates} reloadTemplates={loadTemplates} />
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
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm, token: { borderRadius: 4, colorPrimary: '#2f7df6' } }}>
      <AntApp>{authed ? <Shell /> : <Login onDone={() => setAuthed(true)} />}</AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
