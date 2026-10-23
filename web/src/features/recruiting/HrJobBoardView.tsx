import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  JOB_POSTING_STATUSES,
  JOB_POSTING_STATUS_LABELS,
  type JobPosting,
  type JobPostingInput,
  type JobPostingStatus,
} from '@/types/recruiting';
import {
  createJobPosting,
  deleteJobPosting,
  listJobPostings,
  updateJobPosting,
} from '@/services/recruiting';
import styles from './hr.module.css';

const STATUS_PILL: Record<JobPostingStatus, string> = {
  draft: 'op-pill--gray',
  open: 'op-pill--green',
  paused: 'op-pill--amber',
  closed: 'op-pill--rose',
};

function toInput(values: JobPostingInput): JobPostingInput {
  return {
    title: values.title?.trim() ?? '',
    company_name: values.company_name ?? '',
    department: values.department ?? '',
    location: values.location ?? '',
    employment_type: values.employment_type ?? '',
    salary_range: values.salary_range ?? '',
    headcount: values.headcount ?? 1,
    description: values.description ?? '',
    requirements: values.requirements ?? '',
    status: values.status ?? 'draft',
    notes: values.notes ?? '',
  };
}

export default function HrJobBoardView() {
  const [statusFilter, setStatusFilter] = useState<JobPostingStatus | 'all'>('all');
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<JobPostingInput>();
  const qc = useQueryClient();

  const postings = useQuery({
    queryKey: ['hr', 'job-postings', statusFilter],
    queryFn: () => listJobPostings(statusFilter === 'all' ? undefined : statusFilter),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['hr', 'job-postings'] });

  const saveMutation = useMutation({
    mutationFn: async (values: JobPostingInput) => {
      if (editing) return updateJobPosting(editing.id, values);
      return createJobPosting(values);
    },
    onSuccess: () => {
      message.success(editing ? '岗位已更新' : '岗位已发布');
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      invalidate();
    },
    onError: () => message.error('保存失败，请稍后重试'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteJobPosting(id),
    onSuccess: () => {
      message.success('岗位已删除');
      invalidate();
    },
    onError: () => message.error('删除失败，请稍后重试'),
  });

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ status: 'open', headcount: 1 });
    setModalOpen(true);
  };

  const openEdit = (posting: JobPosting) => {
    setEditing(posting);
    form.setFieldsValue(posting);
    setModalOpen(true);
  };

  const columns = useMemo(
    () => [
      {
        title: '岗位',
        dataIndex: 'title',
        key: 'title',
        render: (_: unknown, posting: JobPosting) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{posting.title}</Typography.Text>
            <Typography.Text type="secondary">
              {[posting.company_name, posting.department].filter(Boolean).join(' · ') || '—'}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        render: (status: JobPostingStatus) => (
          <span className={`op-pill ${STATUS_PILL[status]}`}>
            <span className="op-pill-dot" />
            {JOB_POSTING_STATUS_LABELS[status]}
          </span>
        ),
      },
      { title: '城市', dataIndex: 'location', key: 'location', render: (v: string) => v || '—' },
      { title: '薪资', dataIndex: 'salary_range', key: 'salary_range', render: (v: string) => v || '—' },
      { title: '招聘人数', dataIndex: 'headcount', key: 'headcount' },
      {
        title: '操作',
        key: 'actions',
        render: (_: unknown, posting: JobPosting) => (
          <Space>
            <Button type="link" size="small" onClick={() => openEdit(posting)}>
              编辑
            </Button>
            <Popconfirm
              title="删除该岗位？相关候选人投递记录会一并移除。"
              onConfirm={() => deleteMutation.mutate(posting.id)}
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>岗位管理</span>
          <h1 className={styles.title}>岗位看板</h1>
          <p className={styles.subtitle}>发布和维护招聘岗位，控制上下线状态与招聘人数。</p>
        </div>
      </header>

      <div className={styles.toolbar}>
        <span className="op-pill op-pill--gray">
          共 {postings.data?.length ?? 0} 个岗位
        </span>
        <span className={styles.toolbarSpacer} />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: '全部状态' },
            ...JOB_POSTING_STATUSES.map((status) => ({
              value: status,
              label: JOB_POSTING_STATUS_LABELS[status],
            })),
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          发布岗位
        </Button>
      </div>

      {postings.isLoading ? (
        <div className={`${styles.tableWrap} ${styles.spinWrap}`}>
          <Spin />
        </div>
      ) : postings.isError ? (
        <div className="op-empty-state">
          <div className={styles.emptyBox}>
            <strong>岗位数据加载失败</strong>
            <span>请检查本地服务是否在运行，然后重试。</span>
            <Button onClick={() => void postings.refetch()}>重试</Button>
          </div>
        </div>
      ) : postings.data && postings.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <Table<JobPosting>
            rowKey="id"
            columns={columns}
            dataSource={postings.data}
            pagination={false}
          />
        </div>
      ) : (
        <div className="op-empty-state">
          <div className={styles.emptyBox}>
            <strong>还没有岗位</strong>
            <span>先发布一个招聘岗位，候选人才能投递。</span>
            <Button type="primary" onClick={openCreate}>
              发布岗位
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑岗位' : '发布岗位'}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onOk={() => form.validateFields().then((values) => saveMutation.mutate(toInput(values)))}
        confirmLoading={saveMutation.isPending}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ status: 'open', headcount: 1 }}>
          <Form.Item name="title" label="岗位名称" rules={[{ required: true, message: '请输入岗位名称' }]}>
            <Input placeholder="如：高级后端工程师" />
          </Form.Item>
          <Space size="middle" style={{ display: 'flex' }}>
            <Form.Item name="company_name" label="公司" style={{ flex: 1 }}>
              <Input placeholder="公司名称" />
            </Form.Item>
            <Form.Item name="department" label="部门" style={{ flex: 1 }}>
              <Input placeholder="所属部门" />
            </Form.Item>
          </Space>
          <Space size="middle" style={{ display: 'flex' }}>
            <Form.Item name="location" label="工作城市" style={{ flex: 1 }}>
              <Input placeholder="如 上海" />
            </Form.Item>
            <Form.Item name="employment_type" label="用工类型" style={{ flex: 1 }}>
              <Input placeholder="全职 / 实习" />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="salary_range" label="薪资范围">
              <Input placeholder="如 20-35k" />
            </Form.Item>
            <Form.Item name="headcount" label="招聘人数">
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                style={{ width: 140 }}
                options={JOB_POSTING_STATUSES.map((status) => ({
                  value: status,
                  label: JOB_POSTING_STATUS_LABELS[status],
                }))}
              />
            </Form.Item>
          </Space>
        <Form.Item name="description" label="岗位描述">
          <Input.TextArea rows={3} placeholder="职责描述（JD）" />
        </Form.Item>
        <Form.Item name="requirements" label="任职要求">
          <Input.TextArea rows={3} placeholder="候选人画像与硬性要求" />
        </Form.Item>
      </Form>
      </Modal>
    </div>
  );
}
