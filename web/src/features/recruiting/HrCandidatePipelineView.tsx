import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_LABELS,
  type Candidate,
  type CandidateApplication,
  type CandidateInput,
  type CandidateStage,
  type JobPosting,
} from '@/types/recruiting';
import {
  createCandidate,
  createCandidateApplication,
  deleteCandidate,
  deleteCandidateApplication,
  listCandidateApplications,
  listCandidates,
  listJobPostings,
  updateCandidateApplication,
} from '@/services/recruiting';
import styles from './hr.module.css';

const RATING_OPTIONS = [1, 2, 3, 4, 5].map((value) => ({ value, label: `${value} 星` }));

export default function HrCandidatePipelineView() {
  const qc = useQueryClient();
  const [postingFilter, setPostingFilter] = useState<number | 'all'>('all');
  const [stageFilter, setStageFilter] = useState<CandidateStage | 'all'>('all');
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<Candidate | null>(null);
  const [candidateForm] = Form.useForm<CandidateInput>();
  const [applyForm] = Form.useForm<{ job_posting_id: number; stage: CandidateStage }>();

  const candidates = useQuery({ queryKey: ['hr', 'candidates'], queryFn: listCandidates });
  const postings = useQuery({ queryKey: ['hr', 'job-postings'], queryFn: () => listJobPostings() });
  const applications = useQuery({
    queryKey: ['hr', 'candidate-applications', postingFilter, stageFilter],
    queryFn: () =>
      listCandidateApplications({
        jobPostingId: postingFilter === 'all' ? undefined : postingFilter,
        stage: stageFilter === 'all' ? undefined : stageFilter,
      }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['hr', 'candidates'] });
    void qc.invalidateQueries({ queryKey: ['hr', 'candidate-applications'] });
    void qc.invalidateQueries({ queryKey: ['hr', 'pipeline-summary'] });
  };

  const candidateById = new Map((candidates.data ?? []).map((item) => [item.id, item]));
  const postingById = new Map((postings.data ?? []).map((item) => [item.id, item]));

  const createCandidateMutation = useMutation({
    mutationFn: (values: CandidateInput) => createCandidate(values),
    onSuccess: () => {
      message.success('候选人已添加');
      setCandidateModalOpen(false);
      candidateForm.resetFields();
      invalidate();
    },
    onError: () => message.error('添加失败，请稍后重试'),
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: (id: number) => deleteCandidate(id),
    onSuccess: () => {
      message.success('候选人已删除');
      invalidate();
    },
    onError: () => message.error('删除失败，请稍后重试'),
  });

  const updateApplicationMutation = useMutation({
    mutationFn: (input: { id: number; stage?: CandidateStage; rating?: number | null }) =>
      updateCandidateApplication(input.id, { stage: input.stage, rating: input.rating }),
    onSuccess: () => {
      message.success('已更新');
      invalidate();
    },
    onError: () => message.error('更新失败，请稍后重试'),
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: (id: number) => deleteCandidateApplication(id),
    onSuccess: () => {
      message.success('投递记录已移除');
      invalidate();
    },
    onError: () => message.error('删除失败，请稍后重试'),
  });

  const createApplicationMutation = useMutation({
    mutationFn: (input: { job_posting_id: number; candidate_id: number; stage: CandidateStage }) =>
      createCandidateApplication(input),
    onSuccess: () => {
      message.success('已加入流水线');
      setApplyTarget(null);
      applyForm.resetFields();
      invalidate();
    },
    onError: () => message.error('加入失败，请稍后重试'),
  });

  const applicationColumns = [
    {
      title: '候选人',
      key: 'candidate',
      render: (_: unknown, row: CandidateApplication) => {
        const candidate = candidateById.get(row.candidate_id);
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{candidate?.name ?? `#${row.candidate_id}`}</Typography.Text>
            <Typography.Text type="secondary">{candidate?.email || candidate?.phone || '—'}</Typography.Text>
          </Space>
        );
      },
    },
    {
      title: '应聘岗位',
      key: 'posting',
      render: (_: unknown, row: CandidateApplication) =>
        postingById.get(row.job_posting_id)?.title ?? `#${row.job_posting_id}`,
    },
    {
      title: '阶段',
      key: 'stage',
      render: (_: unknown, row: CandidateApplication) => (
        <Select
          size="small"
          value={row.stage}
          style={{ width: 120 }}
          onChange={(stage: CandidateStage) =>
            updateApplicationMutation.mutate({ id: row.id, stage })
          }
          options={CANDIDATE_STAGES.map((stage) => ({
            value: stage,
            label: CANDIDATE_STAGE_LABELS[stage],
          }))}
        />
      ),
    },
    {
      title: '评分',
      key: 'rating',
      render: (_: unknown, row: CandidateApplication) => (
        <Select
          size="small"
          allowClear
          placeholder="未评分"
          value={row.rating ?? undefined}
          style={{ width: 100 }}
          onChange={(rating?: number) =>
            updateApplicationMutation.mutate({ id: row.id, rating: rating ?? null })
          }
          options={RATING_OPTIONS}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, row: CandidateApplication) => (
        <Popconfirm
          title="移除该候选人投递？"
          onConfirm={() => deleteApplicationMutation.mutate(row.id)}
        >
          <Button type="link" size="small" danger>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const candidateColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: Candidate) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          {row.headline ? <Typography.Text type="secondary">{row.headline}</Typography.Text> : null}
        </Space>
      ),
    },
    { title: '邮箱', dataIndex: 'email', key: 'email', render: (v: string) => v || '—' },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '—' },
    { title: '来源', dataIndex: 'source', key: 'source', render: (v: string) => v || '—' },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, row: Candidate) => (
        <Space>
          <Button type="link" size="small" onClick={() => setApplyTarget(row)}>
            投递岗位
          </Button>
          <Popconfirm
            title="删除该候选人？其投递记录会一并移除。"
            onConfirm={() => deleteCandidateMutation.mutate(row.id)}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const pipelineTab = (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div className={styles.toolbar}>
        <Select
          value={postingFilter}
          style={{ width: 200 }}
          onChange={setPostingFilter}
          options={[
            { value: 'all', label: '全部岗位' },
            ...(postings.data ?? []).map((posting: JobPosting) => ({
              value: posting.id,
              label: posting.title,
            })),
          ]}
        />
        <Select
          value={stageFilter}
          style={{ width: 160 }}
          onChange={setStageFilter}
          options={[
            { value: 'all', label: '全部阶段' },
            ...CANDIDATE_STAGES.map((stage) => ({
              value: stage,
              label: CANDIDATE_STAGE_LABELS[stage],
            })),
          ]}
        />
        <span className="op-pill op-pill--gray">
          共 {applications.data?.length ?? 0} 条
        </span>
      </div>
      {applications.isLoading ? (
        <div className={`${styles.tableWrap} ${styles.spinWrap}`}>
          <Spin />
        </div>
      ) : applications.isError ? (
        <div className="op-empty-state">
          <div className={styles.emptyBox}>
            <strong>投递数据加载失败</strong>
            <span>请检查本地服务是否在运行，然后重试。</span>
            <Button onClick={() => void applications.refetch()}>重试</Button>
          </div>
        </div>
      ) : applications.data && applications.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <Table<CandidateApplication>
            rowKey="id"
            size="middle"
            columns={applicationColumns}
            dataSource={applications.data}
            pagination={false}
          />
        </div>
      ) : (
        <div className="op-empty-state">
          <div className={styles.emptyBox}>
            <strong>还没有候选人投递</strong>
            <span>在候选人库中为候选人添加投递，或等待候选人主动投递。</span>
          </div>
        </div>
      )}
    </Space>
  );

  const candidatesTab = (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div className={styles.toolbar}>
        <span className="op-pill op-pill--gray">
          共 {candidates.data?.length ?? 0} 位候选人
        </span>
        <span className={styles.toolbarSpacer} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCandidateModalOpen(true)}>
          新增候选人
        </Button>
      </div>
      {candidates.isLoading ? (
        <div className={`${styles.tableWrap} ${styles.spinWrap}`}>
          <Spin />
        </div>
      ) : candidates.isError ? (
        <div className="op-empty-state">
          <div className={styles.emptyBox}>
            <strong>候选人数据加载失败</strong>
            <span>请检查本地服务是否在运行，然后重试。</span>
            <Button onClick={() => void candidates.refetch()}>重试</Button>
          </div>
        </div>
      ) : candidates.data && candidates.data.length > 0 ? (
        <div className={styles.tableWrap}>
          <Table<Candidate>
            rowKey="id"
            size="middle"
            columns={candidateColumns}
            dataSource={candidates.data}
            pagination={false}
          />
        </div>
      ) : (
        <div className="op-empty-state">
          <div className={styles.emptyBox}>
            <strong>候选人库为空</strong>
            <span>添加候选人后，即可将其加入岗位流水线。</span>
          </div>
        </div>
      )}
    </Space>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>候选人管理</span>
          <h1 className={styles.title}>候选人筛选</h1>
          <p className={styles.subtitle}>按岗位与阶段推进候选人流水线，随手更新阶段与评分。</p>
        </div>
      </header>

      <Tabs
        items={[
          { key: 'pipeline', label: '投递流水线', children: pipelineTab },
          { key: 'candidates', label: '候选人库', children: candidatesTab },
        ]}
      />

      <Modal
        open={candidateModalOpen}
        title="新增候选人"
        okText="添加"
        onCancel={() => {
          setCandidateModalOpen(false);
          candidateForm.resetFields();
        }}
        onOk={() =>
          candidateForm
            .validateFields()
            .then((values) => createCandidateMutation.mutate(values))
        }
        confirmLoading={createCandidateMutation.isPending}
        destroyOnClose
      >
        <Form form={candidateForm} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请填写候选人姓名' }]}
          >
            <Input placeholder="候选人姓名" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="email" label="邮箱" style={{ flex: 1 }}>
              <Input placeholder="name@example.com" />
            </Form.Item>
            <Form.Item name="phone" label="电话" style={{ flex: 1 }}>
              <Input placeholder="联系电话" />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="source" label="来源渠道" style={{ flex: 1 }}>
              <Input placeholder="如 内推 / 官网 / 猎头" />
            </Form.Item>
            <Form.Item name="headline" label="一句话简介" style={{ flex: 1 }}>
              <Input placeholder="如 5 年 Java 后端" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        open={applyTarget != null}
        title={applyTarget ? `为 ${applyTarget.name} 添加投递` : '添加投递'}
        okText="加入"
        onCancel={() => {
          setApplyTarget(null);
          applyForm.resetFields();
        }}
        onOk={() =>
          applyForm.validateFields().then((values) =>
            createApplicationMutation.mutate({
              job_posting_id: values.job_posting_id,
              candidate_id: applyTarget?.id ?? 0,
              stage: values.stage,
            }),
          )
        }
        confirmLoading={createApplicationMutation.isPending}
        destroyOnClose
      >
        <Form form={applyForm} layout="vertical" initialValues={{ stage: 'applied' }}>
          <Form.Item
            name="job_posting_id"
            label="应聘岗位"
            rules={[{ required: true, message: '请选择岗位' }]}
          >
            <Select
              placeholder="选择岗位"
              options={(postings.data ?? []).map((posting: JobPosting) => ({
                value: posting.id,
                label: posting.title,
              }))}
            />
          </Form.Item>
          <Form.Item name="stage" label="初始阶段">
            <Select
              options={CANDIDATE_STAGES.map((stage) => ({
                value: stage,
                label: CANDIDATE_STAGE_LABELS[stage],
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
