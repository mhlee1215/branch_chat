/**
 * @typedef {'claim' | 'definition' | 'method' | 'evidence' | 'result' | 'question' | 'other'} BlockType
 *
 * @typedef {Object} MessageBlock
 * @property {string} id
 * @property {string} messageId
 * @property {number} index
 * @property {string} title
 * @property {string} content
 * @property {BlockType} blockType
 * @property {boolean} includeInSummary
 *
 * @typedef {Object} Branch
 * @property {string} id
 * @property {string} conversationId
 * @property {string} sourceBlockId
 * @property {string | undefined} parentBranchId
 * @property {string} title
 * @property {number} depth
 * @property {number} columnOrder
 * @property {boolean} isOpen
 */

export const blockTypes = ['claim', 'definition', 'method', 'evidence', 'result', 'question', 'other'];
