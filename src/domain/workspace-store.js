import { segmentAnswer, splitBlock, splitBlockRange, mergeBlocks, renameBlock, setBlockSummaryInclusion } from './block-editor.js';
import { buildBranchContext, createSynthesisInput, findBlock } from './context-builder.js';
import { generateBranchAnswer, generateInitialAnswer, generateSynthesis } from './mock-ai.js';
import { createId } from '../utils/ids.js';

export function createWorkspace(originalQuestion, options = {}) {
  const makeId = options.makeId || createId;
  const conversationId = makeId('conversation');
  const assistantMessageId = makeId('message');
  const answer = options.answer || generateInitialAnswer(originalQuestion);
  const blocks = segmentAnswer(answer, { makeId, messageId: assistantMessageId });

  return {
    conversationId,
    originalQuestion,
    rootMessageId: assistantMessageId,
    messages: [
      { id: makeId('message'), conversationId, role: 'user', content: originalQuestion },
      { id: assistantMessageId, conversationId, role: 'assistant', content: answer },
    ],
    blocks,
    branches: [],
    activeBranchId: null,
    synthesis: '',
  };
}

export function createWorkspaceFromAssistant(originalQuestion, assistantContent, options = {}) {
  return createWorkspace(originalQuestion, { ...options, answer: assistantContent });
}

export function askDeeper(workspace, blockId, question, options = {}) {
  const makeId = options.makeId || createId;
  const sourceBlock = findBlock(workspace, blockId);
  if (!sourceBlock) throw new Error(`Block not found: ${blockId}`);

  const parentBranch = options.parentBranchId
    ? workspace.branches.find((branch) => branch.id === options.parentBranchId)
    : null;
  const branch = {
    id: makeId('branch'),
    conversationId: workspace.conversationId,
    sourceBlockId: blockId,
    parentBranchId: parentBranch?.id,
    title: sourceBlock.title,
    depth: parentBranch ? parentBranch.depth + 1 : 1,
    columnOrder: workspace.branches.length + 1,
    isOpen: true,
  };

  const workspaceWithBranch = { ...workspace, branches: [...workspace.branches, branch] };
  const context = buildBranchContext(workspaceWithBranch, branch.id, question);
  const answer = options.answer || generateBranchAnswer(sourceBlock, question);
  const assistantMessageId = makeId('message');
  const answerBlocks = segmentAnswer(answer, { makeId, messageId: assistantMessageId }).map((block) => ({
    ...block,
    parentBlockId: blockId,
  }));

  return {
    workspace: {
      ...workspaceWithBranch,
      messages: [
        ...workspace.messages,
        { id: makeId('message'), conversationId: workspace.conversationId, branchId: branch.id, role: 'user', content: question },
        { id: assistantMessageId, conversationId: workspace.conversationId, branchId: branch.id, role: 'assistant', content: answer },
      ],
      blocks: [...workspace.blocks, ...answerBlocks],
      activeBranchId: branch.id,
    },
    branch,
    context,
  };
}

export function appendBranchAnswer(workspace, blockId, question, answer, options = {}) {
  return askDeeper(workspace, blockId, question, { ...options, answer });
}

export function appendSelectionBranchAnswer(workspace, parentBlockId, selectedText, question, answer, options = {}) {
  const makeId = options.makeId || createId;
  const parentBlock = findBlock(workspace, parentBlockId);
  const cleanText = selectedText.trim();
  if (!parentBlock) throw new Error(`Parent block not found: ${parentBlockId}`);
  if (!cleanText) throw new Error('Selected text cannot be empty.');

  const selectionBlock = {
    id: makeId('selection'),
    messageId: `selection-source-${parentBlockId}`,
    index: 0,
    title: cleanText.length > 42 ? `${cleanText.slice(0, 42)}...` : cleanText,
    content: cleanText,
    blockType: 'question',
    includeInSummary: true,
    parentBlockId,
    sourceKind: 'text-selection',
    sourceRange: options.sourceRange,
  };

  const parentMessage = workspace.messages.find((message) => message.id === parentBlock.messageId);
  const parentBranchId = parentBlock.messageId === workspace.rootMessageId
    ? undefined
    : options.parentBranchId || parentMessage?.branchId;

  return askDeeper(
    { ...workspace, blocks: [...workspace.blocks, selectionBlock] },
    selectionBlock.id,
    question,
    { ...options, parentBranchId, answer },
  );
}

export function splitWorkspaceBlock(workspace, blockId, splitAt, options = {}) {
  return { ...workspace, blocks: splitBlock(workspace.blocks, blockId, splitAt, options) };
}

export function splitWorkspaceBlockRange(workspace, blockId, start, end, options = {}) {
  return { ...workspace, blocks: splitBlockRange(workspace.blocks, blockId, start, end, options) };
}

export function mergeWorkspaceBlocks(workspace, blockIds) {
  const mergePlan = createBlockMergePlan(workspace.blocks, blockIds);
  const mergedBlocks = mergeBlocks(workspace.blocks, blockIds);
  return {
    ...workspace,
    blocks: reparentBlocksAfterMerge(mergedBlocks, mergePlan),
    branches: reparentBranchesAfterMerge(workspace.branches, mergePlan),
  };
}

function createBlockMergePlan(blocks, blockIds) {
  const selected = blocks.filter((block) => blockIds.includes(block.id)).sort((a, b) => a.index - b.index);
  if (selected.length !== blockIds.length) throw new Error('One or more blocks were not found.');
  if (selected.length < 2) throw new Error('At least two blocks are required to merge.');
  if (new Set(selected.map((block) => block.messageId)).size !== 1) {
    throw new Error('Only blocks from the same assistant answer can be merged.');
  }
  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index].index !== selected[index - 1].index + 1) {
      throw new Error('Only adjacent blocks can be merged.');
    }
  }

  let offset = 0;
  const contentOffsets = new Map();
  selected.forEach((block, index) => {
    contentOffsets.set(block.id, offset);
    offset += block.content.length;
    if (index < selected.length - 1) offset += 2;
  });

  return {
    mergedBlockId: selected[0].id,
    mergedBlockIds: new Set(selected.map((block) => block.id)),
    contentOffsets,
  };
}

function reparentBranchesAfterMerge(branches, mergePlan) {
  return branches.map((branch) => (
    mergePlan.mergedBlockIds.has(branch.sourceBlockId)
      ? { ...branch, sourceBlockId: mergePlan.mergedBlockId }
      : branch
  ));
}

function reparentBlocksAfterMerge(blocks, mergePlan) {
  return blocks.map((block) => {
    const parentWasMerged = mergePlan.mergedBlockIds.has(block.parentBlockId);
    const sourceRangesTouchMerge = block.sourceRanges?.some((range) => mergePlan.mergedBlockIds.has(range.blockId));
    if (!parentWasMerged && !sourceRangesTouchMerge) return block;
    const nextBlock = parentWasMerged ? { ...block, parentBlockId: mergePlan.mergedBlockId } : { ...block };
    if (block.sourceKind !== 'text-selection') return nextBlock;
    return {
      ...nextBlock,
      sourceRange: parentWasMerged ? remapSourceRangeAfterMerge(block, mergePlan) : block.sourceRange,
      sourceRanges: remapSourceRangesAfterMerge(block, mergePlan),
    };
  });
}

function remapSourceRangeAfterMerge(block, mergePlan) {
  const parentOffset = mergePlan.contentOffsets.get(block.parentBlockId);
  if (!Number.isInteger(parentOffset)) return block.sourceRange;
  if (
    Number.isInteger(block.sourceRange?.start)
    && Number.isInteger(block.sourceRange?.end)
    && block.sourceRange.end > block.sourceRange.start
  ) {
    return {
      start: parentOffset + block.sourceRange.start,
      end: parentOffset + block.sourceRange.end,
    };
  }
  return {
    start: parentOffset,
    end: parentOffset + block.content.length,
  };
}

function remapSourceRangesAfterMerge(block, mergePlan) {
  if (!Array.isArray(block.sourceRanges)) return block.sourceRanges;
  return block.sourceRanges.map((range) => {
    if (!mergePlan.mergedBlockIds.has(range.blockId)) return range;
    const parentOffset = mergePlan.contentOffsets.get(range.blockId);
    if (!Number.isInteger(parentOffset)) return range;
    return {
      ...range,
      blockId: mergePlan.mergedBlockId,
      start: parentOffset + range.start,
      end: parentOffset + range.end,
    };
  });
}

export function renameWorkspaceBlock(workspace, blockId, title) {
  return { ...workspace, blocks: renameBlock(workspace.blocks, blockId, title) };
}

export function setWorkspaceBlockSummaryInclusion(workspace, blockId, includeInSummary) {
  return { ...workspace, blocks: setBlockSummaryInclusion(workspace.blocks, blockId, includeInSummary) };
}

export function synthesizeWorkspace(workspace) {
  return { ...workspace, synthesis: generateSynthesis(createSynthesisInput(workspace)) };
}

export function createDemoWorkspace(options = {}) {
  const makeId = options.makeId || createId;
  const rootSections = [
    '트랜스포머(Transformer)는 한마디로 문장/이미지/시계열 같은 입력 안에서 "어떤 부분이 어떤 부분을 참고해야 하는지"를 Attention으로 계산하는 구조야. RNN처럼 순서대로 하나씩 읽는 게 아니라, 입력 전체를 한 번에 보고 각 토큰이 서로를 참고하게 만든다는 게 핵심이야.',
    [
      '1. 전체 구조',
      '',
      '원래 Transformer는 번역을 위해 나온 구조라서 크게 Encoder blocks와 Decoder blocks로 나뉘어 있어.',
      '',
      'Input sentence → Embedding + Positional Encoding → Encoder blocks → Decoder blocks → Output sentence',
      '',
      '하지만 요즘 LLM에서는 구조가 조금 나뉘어. Encoder-only는 BERT처럼 입력 이해에 강하고, Decoder-only는 GPT나 LLaMA처럼 다음 토큰 생성에 강해. Encoder-Decoder는 T5나 original Transformer처럼 번역/변환 작업에 강하지. ChatGPT 같은 LLM은 보통 Decoder-only Transformer 계열이야.',
    ].join('\n'),
    [
      '2. 입력: 토큰과 임베딩',
      '',
      '문장은 먼저 토큰으로 쪼개져. 예를 들어 "I love cats"는 ["I", "love", "cats"]처럼 나뉠 수 있어.',
      '',
      '각 토큰은 숫자 벡터로 바뀌는데, 이 벡터를 Embedding이라고 해. 그런데 Transformer는 입력을 한 번에 보기 때문에 단어의 순서를 기본적으로 모른다. 그래서 Positional Encoding 또는 Position Embedding을 더해줘.',
      '',
      '즉, "love"라는 단어 자체의 의미뿐 아니라 "문장 안에서 두 번째 위치"라는 정보도 같이 넣는 거야.',
    ].join('\n'),
    [
      '3. 핵심: Self-Attention',
      '',
      'Self-Attention은 각 토큰이 다른 토큰들을 얼마나 참고할지 계산하는 과정이야. 예를 들어 "The animal did not cross the street because it was tired."에서 "it"이 무엇을 가리키는지 알려면 "animal"을 참고해야 해.',
      '',
      '각 토큰은 Query, Key, Value라는 세 가지 벡터로 변환돼. Query는 내가 찾고 싶은 정보, Key는 내가 가진 정보의 라벨, Value는 실제 전달할 정보라고 보면 돼.',
      '',
      'Attention은 Query와 Key를 비교해서 관련도 점수를 만들고, 그 점수로 Value를 섞어. "it"의 Query가 "animal"의 Key와 잘 맞으면 "animal"의 Value를 많이 가져오는 식이야.',
      '',
      '수식으로는 보통 이렇게 적어.',
      '',
      '$$Attention(Q, K, V) = softmax((QK^T) / sqrt(d_k))V$$',
      '',
      '아주 거칠게 코드로 쓰면 이런 흐름이야.',
      '',
      '```js',
      'function attention(query, keys, values) {',
      '  const scores = keys.map((key) => dot(query, key) / Math.sqrt(query.length));',
      '  const weights = softmax(scores);',
      '  return weightedSum(values, weights);',
      '}',
      '```',
    ].join('\n'),
    [
      '4. Multi-Head Attention',
      '',
      '하나의 Attention만 쓰면 한 가지 관점으로만 문장을 보게 돼. 그래서 Transformer는 여러 개의 Attention head를 동시에 사용해.',
      '',
      'Head 1은 문법 관계를 보고, Head 2는 대명사 참조를 보고, Head 3은 위치 관계를 보고, Head 4는 의미 관계를 보는 식이야. 여러 명의 사람이 같은 문장을 각자 다른 관점으로 읽고 나중에 의견을 합치는 느낌이라고 보면 돼.',
    ].join('\n'),
    [
      '5. Feed Forward Network',
      '',
      'Attention이 어디를 봐야 하는지 정했다면, 그 다음에는 각 토큰별로 작은 MLP를 통과시켜. 이 Feed Forward Network는 각 토큰의 표현을 더 복잡하고 유용하게 바꿔주는 역할을 해.',
      '',
      'Transformer block 하나는 보통 Self-Attention, Add & LayerNorm, Feed Forward Network, Add & LayerNorm의 흐름을 가져.',
    ].join('\n'),
    [
      '6. Residual Connection과 LayerNorm',
      '',
      'Transformer 안에는 Residual Connection이 많이 들어가. output = input + transformed(input)처럼 원래 정보를 다음 층으로 같이 넘겨서 깊은 네트워크에서도 학습이 안정적으로 되게 해.',
      '',
      'LayerNorm은 각 층의 값을 적당히 정규화해서 학습이 폭주하지 않도록 도와줘.',
    ].join('\n'),
    [
      '7. Decoder-only Transformer, 즉 GPT 구조',
      '',
      'GPT 계열은 Token Embedding + Position Embedding을 거쳐 여러 Transformer Block을 통과한 뒤 Linear layer를 통해 다음 토큰 확률을 계산해.',
      '',
      '예를 들어 입력이 "The cat is on the"이면 mat, table, floor 같은 다음 토큰 후보의 확률을 계산하고, 가장 적절한 토큰을 뽑아 이어 붙여.',
    ].join('\n'),
    [
      '8. Masked Self-Attention',
      '',
      'GPT 같은 생성 모델에서는 미래 토큰을 보면 안 돼. "I love cats"에서 "love"를 예측하는 시점에 "cats"를 보면 치팅이기 때문이야.',
      '',
      '그래서 Decoder-only Transformer는 causal mask를 써. 토큰 1은 토큰 1만 보고, 토큰 2는 토큰 1~2만 보고, 토큰 3은 토큰 1~3만 보게 만드는 식이야.',
    ].join('\n'),
    [
      '9. 한 줄 요약',
      '',
      'Transformer는 입력을 토큰 벡터로 바꾸고, 각 토큰이 Attention을 통해 다른 토큰들을 참고하면서 여러 층을 거쳐 점점 더 풍부한 표현을 만든 뒤, 다음 토큰이나 정답을 예측하는 구조야.',
      '',
      'Embedding → Positional Encoding → Multi-Head Self-Attention → Feed Forward Network → 반복 → Output',
      '',
      '핵심은 Attention이 RNN처럼 순차적으로 읽지 않고도 문맥 관계를 직접 계산하게 해준다는 점이야.',
    ].join('\n'),
  ];
  let workspace = createWorkspace('Transformer가 뭔지 대학생에게 설명하듯이 알려줘.', {
    makeId,
    answer: rootSections.join('\n\n'),
  });
  workspace = {
    ...workspace,
    blocks: rootSections.map((content, index) => ({
      ...workspace.blocks[index],
      id: workspace.blocks[index]?.id || makeId('block'),
      messageId: workspace.rootMessageId,
      index,
      title: content.split('\n').find(Boolean)?.replace(/^\d+\.\s*/, '') || `Block ${index + 1}`,
      content,
      includeInSummary: true,
    })),
  };

  const rootBlocks = [...workspace.blocks];

  let result = appendBranchAnswer(
    workspace,
    rootBlocks[0].id,
    'RNN처럼 순서대로 읽는 방식과 비교해서 왜 이게 중요한지 설명해줘.',
    [
      'RNN은 문장을 한 줄로 세워놓고 앞에서부터 차례대로 읽는 방식에 가까워. 그래서 앞부분에서 나온 정보를 계속 압축해서 뒤로 넘겨야 하지.',
      'Transformer는 문장 전체를 펼쳐놓고 단어들끼리 직접 연결을 계산해. 그래서 멀리 떨어진 단어도 필요한 경우 바로 참고할 수 있어.',
      '이 차이 때문에 Transformer는 긴 문맥을 다루기 쉽고, GPU에서 병렬 처리하기도 좋아서 대규모 학습에 훨씬 유리해졌어.',
    ].join('\n\n'),
    { makeId },
  );
  workspace = result.workspace;

  const rootBranchAnswers = [
    [
      'Encoder는 입력 전체를 이해하는 데 강해. 그래서 문장 분류, 검색, 의미 비교처럼 "주어진 텍스트를 잘 읽는" 작업에 잘 맞아.',
      'Decoder는 지금까지의 토큰을 보고 다음 토큰을 생성하는 데 강해. GPT가 여기에 속하고, 대화나 글쓰기처럼 계속 이어 쓰는 작업에 적합해.',
      'Encoder-Decoder는 입력을 이해한 뒤 다른 형태의 출력으로 바꾸는 데 좋기 때문에 번역이나 변환 작업에 많이 쓰였어.',
    ].join('\n\n'),
    [
      '토큰화는 문장을 모델이 처리할 수 있는 작은 조각으로 나누는 단계야. 이 조각은 단어일 수도 있고, 단어의 일부일 수도 있어.',
      '임베딩은 그 조각을 숫자 벡터로 바꾸는 단계야. 모델은 문자 그대로의 단어를 보는 게 아니라 이 숫자 벡터를 계산해.',
      '위치 정보는 "이 토큰이 문장 어디쯤 있는지"를 알려주는 신호야. Transformer는 입력을 동시에 보기 때문에 위치 정보를 따로 넣어줘야 해.',
      '예를 들어 토큰 임베딩 `E_token`과 위치 임베딩 `E_pos`를 더해서 $x_i = E_token(i) + E_pos(i)$ 같은 입력 벡터를 만들 수 있어.',
    ].join('\n\n'),
    [
      'Self-Attention은 각 토큰이 문장 안의 다른 토큰을 직접 참고하게 만드는 장치야.',
      '예를 들어 "it"이라는 단어가 나오면, 모델은 이 단어가 앞의 "animal"과 얼마나 관련 있는지 계산할 수 있어.',
      '그래서 긴 문장에서 멀리 떨어진 단어끼리도 필요한 경우 강하게 연결될 수 있어.',
    ].join('\n\n'),
    [
      'Multi-Head Attention은 여러 관점으로 같은 문장을 읽는 장치야.',
      '어떤 head는 문법 관계를 보고, 어떤 head는 대명사 참조를 보고, 또 어떤 head는 의미적으로 가까운 단어를 볼 수 있어.',
      '하나의 관점만 쓰는 것보다 여러 관점을 합치면 문장을 더 풍부하게 이해할 수 있어.',
    ].join('\n\n'),
    [
      'Feed Forward Network는 Attention으로 모은 정보를 각 토큰별로 다시 가공하는 작은 신경망이야.',
      'Attention이 "어디를 볼지"를 정한다면, Feed Forward는 "그 정보를 어떻게 바꿔 쓸지"를 정하는 단계에 가까워.',
      '이 과정이 여러 층 반복되면서 토큰 표현은 단순한 단어 벡터에서 문맥을 반영한 표현으로 바뀌어.',
    ].join('\n\n'),
    [
      'Residual Connection은 원래 입력을 다음 층으로 그대로 우회시켜 함께 더해주는 연결이야.',
      '이 덕분에 네트워크가 깊어져도 원래 정보가 완전히 사라지지 않고, 학습도 더 안정적으로 진행돼.',
      'LayerNorm은 각 층의 값 규모를 정리해줘서 너무 커지거나 작아지는 문제를 줄여줘.',
    ].join('\n\n'),
    [
      'GPT는 Decoder-only Transformer라서 지금까지 나온 토큰만 보고 다음 토큰을 예측해.',
      '입력이 "The cat is on the"라면 모델은 mat, table, floor 같은 후보에 확률을 매기고 하나를 고른다.',
      '이 과정을 아주 빠르게 반복하면 한 문장, 한 문단, 전체 답변이 이어져서 생성돼.',
    ].join('\n\n'),
    [
      'Masked Self-Attention은 미래 토큰을 보지 못하게 가리는 규칙이야.',
      '생성 모델이 다음 단어를 맞히는 훈련을 할 때 정답 단어를 미리 보면 의미가 없기 때문에 이런 마스크가 필요해.',
      '그래서 GPT는 왼쪽에서 오른쪽으로만 정보를 보며 자연스럽게 글을 이어 쓰는 방식으로 학습돼.',
    ].join('\n\n'),
    [
      '한 줄로 말하면 Transformer는 토큰들이 서로를 참고하는 네트워크야.',
      'Embedding과 위치 정보로 입력을 만들고, Multi-Head Attention과 Feed Forward Network를 여러 번 반복해 문맥 표현을 만든다.',
      '그 결과 다음 토큰 예측, 문장 이해, 번역, 요약 같은 다양한 작업을 처리할 수 있어.',
    ].join('\n\n'),
  ];

  for (let index = 1; index < rootBlocks.length; index += 1) {
    result = appendBranchAnswer(
      workspace,
      rootBlocks[index].id,
      '이 블록을 더 자세히 설명해줘.',
      rootBranchAnswers[index - 1],
      { makeId },
    );
    workspace = {
      ...result.workspace,
      branches: result.workspace.branches.map((branch) => (
        branch.id === result.branch.id ? { ...branch, isOpen: false } : branch
      )),
    };
  }

  const structureBranch = workspace.branches.find((branch) => branch.sourceBlockId === rootBlocks[1].id);
  const structureBranchBlock = workspace.blocks.find((block) => block.parentBlockId === rootBlocks[1].id);
  result = appendBranchAnswer(
    workspace,
    structureBranchBlock.id,
    'Encoder-only와 Decoder-only를 실제 사용 예시로 비교해줘.',
    [
      'Encoder-only는 문제지를 다 읽은 뒤 정답을 고르는 학생에 가까워. BERT처럼 문장 분류, 검색, 유사도 계산, 감정 분석에 잘 맞아.',
      'Decoder-only는 앞에 쓴 문장을 보고 다음 문장을 계속 이어 쓰는 작가에 가까워. GPT처럼 대화, 글쓰기, 코드 생성에 잘 맞지.',
      '둘 다 Transformer지만, 어떤 방향으로 정보를 보게 만들었는지와 학습 목표가 달라서 잘하는 일이 달라지는 거야.',
    ].join('\n\n'),
    { makeId, parentBranchId: structureBranch?.id },
  );
  workspace = {
    ...result.workspace,
    branches: result.workspace.branches.map((branch) => (
      branch.id === result.branch.id ? { ...branch, isOpen: false } : branch
    )),
  };

  const firstRootBranch = workspace.branches.find((branch) => branch.sourceBlockId === rootBlocks[0].id);

  result = appendBranchAnswer(
    workspace,
    workspace.blocks.find((block) => block.parentBlockId === rootBlocks[0].id)?.id,
    '입력 전체를 한 번에 본다는 걸 더 직관적으로 비유해줘.',
    [
      '스터디 모임을 떠올리면 쉬워. 한 학생이 발표 내용을 이해하려고 할 때 모든 친구의 말을 똑같이 듣지는 않지.',
      '지금 이해하려는 주제와 관련 있는 친구의 설명에는 더 집중하고, 덜 관련 있는 말은 조금만 참고해.',
      'Transformer의 Attention도 비슷해. 각 토큰이 다른 토큰들에게 "너를 얼마나 참고할까?"라는 가중치를 주고, 그 가중치에 따라 정보를 섞어.',
    ].join('\n\n'),
    { makeId, parentBranchId: firstRootBranch?.id },
  );
  workspace = result.workspace;

  result = appendBranchAnswer(
    workspace,
    workspace.blocks.find((block) => block.content.includes('스터디 모임'))?.id,
    'query, key, value를 이 비유에 맞춰 설명해줘.',
    [
      'Query는 "내가 지금 알고 싶은 것"에 가깝습니다.',
      'Key는 "각 친구가 어떤 주제를 잘 설명할 수 있는지"를 나타냅니다.',
      'Value는 실제로 참고하게 되는 친구의 설명 내용입니다.',
    ].join('\n\n'),
    { makeId, parentBranchId: workspace.activeBranchId },
  );

  workspace = result.workspace;

  const qkvBlock = workspace.blocks.find((block) => block.content.includes('Query는 "내가 지금 알고 싶은 것"'));
  result = appendBranchAnswer(
    workspace,
    qkvBlock.id,
    '그럼 실제 attention 계산에서는 이 세 값이 어떤 순서로 쓰여?',
    [
      '먼저 현재 토큰의 Query와 모든 후보 토큰의 Key를 비교해서 관련도 점수를 계산해.',
      '그 점수는 softmax를 거치면서 합이 1인 가중치가 돼. 관련성이 높은 토큰은 큰 가중치를 받고, 덜 관련 있는 토큰은 작은 가중치를 받아.',
      '마지막으로 그 가중치로 각 토큰의 Value를 섞어 현재 토큰의 새 표현을 만든다. 그래서 Q와 K는 "무엇을 얼마나 볼지"를 정하고, V는 실제로 가져오는 정보라고 보면 돼.',
      '',
      '```python',
      'scores = (Q @ K.T) / sqrt(d_k)',
      'weights = softmax(scores)',
      'output = weights @ V',
      '```',
    ].join('\n\n'),
    { makeId, parentBranchId: workspace.activeBranchId },
  );

  workspace = result.workspace;

  const attentionOrderBlock = workspace.blocks.find((block) => block.content.includes('softmax를 거치면서'));
  result = appendBranchAnswer(
    workspace,
    attentionOrderBlock.id,
    'softmax가 왜 필요한지 수식 없이 직관적으로 설명해줘.',
    [
      'softmax는 여러 후보 중 어디에 더 집중할지 정하는 배분표를 만드는 단계라고 보면 돼.',
      '관련도 점수는 원래 그냥 큰 숫자와 작은 숫자의 모음이야. 그런데 이 상태로는 "전체 관심 중 몇 퍼센트를 어디에 줄지"가 분명하지 않아.',
      'softmax를 거치면 모든 가중치의 합이 1이 돼. 그래서 animal에는 70%, street에는 10%, tired에는 20%처럼 관심을 나눠 줄 수 있어.',
      '결국 softmax는 점수를 확률처럼 다루기 쉽게 바꿔서 Value들을 안정적으로 섞을 수 있게 해주는 장치야.',
    ].join('\n\n'),
    { makeId, parentBranchId: workspace.activeBranchId },
  );

  workspace = result.workspace;
  const depthFiveActiveId = workspace.activeBranchId;

  result = appendSelectionBranchAnswer(
    workspace,
    rootBlocks[3].id,
    'Query는 내가 찾고 싶은 정보, Key는 내가 가진 정보의 라벨, Value는 실제 전달할 정보',
    '이 문장만 따로 더 쉽게 설명해줘.',
    [
      '이 선택 구절은 Q, K, V를 검색 상황으로 바꾸면 훨씬 쉽게 이해돼.',
      'Query는 검색창에 입력한 질문이고, Key는 각 문서가 가진 색인 카드야. Value는 실제로 가져와서 읽게 되는 문서 내용이라고 보면 돼.',
      'Attention은 내 Query와 여러 Key를 비교해서 가장 잘 맞는 Value를 더 많이 가져오는 방식이야. 그래서 "it" 같은 단어가 앞의 "animal"을 더 강하게 참고할 수 있어.',
    ].join('\n\n'),
    { makeId },
  );

  return {
    ...result.workspace,
    activeBranchId: depthFiveActiveId,
    branches: result.workspace.branches.map((branch) => (
      branch.id === result.branch.id ? { ...branch, isOpen: false } : branch
    )),
  };
}
