export function findBlock(workspace, blockId) {
  return workspace.blocks.find((block) => block.id === blockId);
}

export function buildBranchContext(workspace, branchId, userQuestion, options = {}) {
  const branch = workspace.branches.find((item) => item.id === branchId);
  if (!branch) throw new Error(`Branch not found: ${branchId}`);

  const sourceBlock = findBlock(workspace, branch.sourceBlockId);
  if (!sourceBlock) throw new Error(`Source block not found: ${branch.sourceBlockId}`);

  const mode = options.mode || 'selected-block';
  const context = [
    { role: 'system', content: 'Answer using focused branch context. Be explicit about uncertainty.' },
    { role: 'user', content: workspace.originalQuestion },
  ];

  if (mode === 'parent-answer') {
    const siblings = workspace.blocks.filter((block) => block.messageId === sourceBlock.messageId);
    context.push({ role: 'assistant', content: siblings.map(formatBlock).join('\n\n') });
  } else if (mode === 'nearby-blocks') {
    const nearby = workspace.blocks.filter((block) => (
      block.messageId === sourceBlock.messageId && Math.abs(block.index - sourceBlock.index) <= 1
    ));
    context.push({ role: 'assistant', content: nearby.map(formatBlock).join('\n\n') });
  } else {
    context.push({ role: 'assistant', content: formatBlock(sourceBlock) });
  }

  const branchMessages = workspace.messages.filter((message) => message.branchId === branchId);
  context.push(...branchMessages.map((message) => ({ role: message.role, content: message.content })));
  context.push({ role: 'user', content: userQuestion });
  return context;
}

export function createSynthesisInput(workspace) {
  const includedBlocks = workspace.blocks.filter((block) => block.includeInSummary);
  const openBranches = workspace.branches.filter((branch) => branch.isOpen);
  return {
    originalQuestion: workspace.originalQuestion,
    blocks: includedBlocks.map((block) => ({ id: block.id, title: block.title, content: block.content })),
    branches: openBranches.map((branch) => ({
      id: branch.id,
      title: branch.title,
      messages: workspace.messages.filter((message) => message.branchId === branch.id),
    })),
  };
}

function formatBlock(block) {
  return `[${block.title}]\n${block.content}`;
}
