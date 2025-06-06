import { Address, beginCell, Cell, toNano } from "@ton/core";
import { TonClient, WalletContractV4, internal } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

// Configuration
const MNEMONIC = process.env.TON_MNEMONIC?.split(" ") || [
    "ticket", "sea", "movie", "present", "outer", "dash", "attract", "clip",
    "pepper", "slow", "employ", "rubber", "one", "gentle", "razor", "step", 
    "method", "alien", "cash", "tooth", "side", "green", "tired", "honey"
];

// Utility functions
function createTextMessage(text: string): Cell {
    return beginCell()
        .storeUint(0, 32)
        .storeStringTail(text)
        .endCell();
}

function createExternalMessageWithInit(
    to: Address,
    body: Cell,
    importFee: bigint = 0n,
    init: Cell
): Cell {
    return beginCell()
        .storeUint(0b10, 2) // ext_in_msg_info$10
        .storeUint(0, 2) // src addr_none
        .storeAddress(to)
        .storeCoins(importFee)
        .storeBit(true) // has_init
        .storeRef(init) // state_init
        .storeBit(true) // body_in_ref
        .storeRef(body)
        .endCell();
}

function createNormalizedExternalMessage(to: Address, body: Cell): Cell {
    return beginCell()
        .storeUint(0b10, 2) // ext_in_msg_info$10
        .storeUint(0, 2) // src addr_none
        .storeAddress(to)
        .storeCoins(0) // import_fee = 0
        .storeBit(false) // no init
        .storeBit(true) // body_in_ref
        .storeRef(body)
        .endCell();
}

// Normalize real external message according to TEP-467
function normalizeRealExternalMessage(originalMessage: Cell): Cell {
    // For wallet V4 external messages, we need to extract the internal message
    // and create a normalized external message with that internal message as body
    const slice = originalMessage.beginParse();
    slice.skip(2); // skip msg type (should be 0b10)
    slice.skip(2); // skip src (should be addr_none)
    const dest = slice.loadAddress();
    slice.loadCoins(); // skip import_fee
    const hasInit = slice.loadBit();
    if (hasInit) {
        slice.loadRef(); // skip state_init
    }
    const hasBodyRef = slice.loadBit();
    
    if (!hasBodyRef || slice.remainingRefs === 0) {
        throw new Error("Expected body reference in external message");
    }
    
    // The body contains the wallet's signed internal message
    const signedBody = slice.loadRef();
    
    // Parse signed body to extract the internal message
    const signedSlice = signedBody.beginParse();
    signedSlice.skip(512); // skip signature
    signedSlice.loadUint(32); // subwallet_id
    signedSlice.loadUint(32); // valid_until
    signedSlice.loadUint(32); // seqno
    signedSlice.loadUint(8); // mode
    
    // The internal message is the next reference
    if (signedSlice.remainingRefs === 0) {
        throw new Error("Expected internal message reference");
    }
    
    const internalMessage = signedSlice.loadRef();
    
    // Create TEP-467 normalized version with internal message as body
    return beginCell()
        .storeUint(0b10, 2) // ext_in_msg_info$10
        .storeUint(0, 2) // src addr_none
        .storeAddress(dest)
        .storeCoins(0) // import_fee = 0 (normalized)
        .storeBit(false) // no init (normalized)
        .storeBit(true) // body_in_ref
        .storeRef(internalMessage)
        .endCell();
}

// --- Поиск ext_in_msg_info$10 в Cell (рекурсивно) ---
function findExternalMsgCell(cell: Cell): Cell {
    try {
        const slice = cell.beginParse();
        const msgType = slice.loadUint(2);
        if (msgType === 0b10) {
            return cell;
        }
    } catch (e) {
        // не удалось распарсить, идём дальше
    }
    // Если нет — пробуем первый реф (envelope)
    if (cell.refs.length > 0) {
        try {
            return findExternalMsgCell(cell.refs[0]);
        } catch (e) {
            // fallback: пробуем остальные рефы
            for (let i = 1; i < cell.refs.length; i++) {
                try {
                    return findExternalMsgCell(cell.refs[i]);
                } catch {}
            }
        }
    }
    throw new Error("Cannot find ext_in_msg_info$10 in cell or its refs");
}

function normalizeExternalMessageTEP467(original: Cell): Cell {
    // Для Wallet V4: корневой Cell — подпись + метаданные + body (в рефе)
    const slice = original.beginParse();
    slice.skip(512); // подпись
    slice.loadUint(32); // subwallet_id
    slice.loadUint(32); // valid_until
    slice.loadUint(32); // seqno
    slice.loadUint(8);  // mode
    if (original.refs.length === 0) {
        throw new Error('External message has no refs (expected body in ref)');
    }
    const extCell = original.refs[0]; // ext_in_msg_info$10
    const extSlice = extCell.beginParse();
    const msgType = extSlice.loadUint(2); // 0b10
    if (msgType !== 0b10) throw new Error("Not an external message (in body ref)");
    const srcAddrType = extSlice.loadUint(2);
    const dest = extSlice.loadAddress();
    const importFee = extSlice.loadCoins();
    const hasInit = extSlice.loadBit();
    let body: Cell;
    if (hasInit) {
        extSlice.loadRef();
    }
    const hasBodyRef = extSlice.loadBit();
    if (hasBodyRef) {
        body = extSlice.loadRef();
    } else {
        body = extSlice.asCell();
    }
    // Диагностика
    console.log('normalizeExternalMessageTEP467:');
    console.log('  srcAddrType:', srcAddrType);
    console.log('  dest:', dest.toString());
    console.log('  importFee:', importFee.toString());
    if (dest.toString() === '0:0000000000000000000000000000000000000000000000000000000000000000') {
        console.error('❌ Ошибка: dest = 0! Структура сообщения:');
        console.error(extCell.toString());
        throw new Error('Invalid dest address in external message');
    }
    return beginCell()
        .storeUint(0b10, 2)
        .storeUint(srcAddrType, 2)
        .storeAddress(dest)
        .storeCoins(importFee)
        .storeBit(false)
        .storeBit(true)
        .storeRef(body)
        .endCell();
}

// --- Диагностика: вывод дерева Cell ---
function printCellTree(cell: Cell, depth = 0) {
    const indent = ' '.repeat(depth * 2);
    console.log(`${indent}Cell: ${cell.hash().toString('hex')}`);
    console.log(`${indent}Bits: x{${cell.bits.toString('hex')}}`);
    for (let i = 0; i < cell.refs.length; i++) {
        printCellTree(cell.refs[i], depth + 1);
    }
}

// API functions with rate limiting
async function sleep(seconds: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function apiCallWithRetry<T>(
    apiCall: () => Promise<T>, 
    maxRetries: number = 3, 
    delaySeconds: number = 3
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 1) await sleep(delaySeconds);
            return await apiCall();
        } catch (error: any) {
            const isRateLimit = error?.response?.status === 429 || error?.status === 429;
            if (attempt === maxRetries) throw error;
            if (isRateLimit) await sleep(delaySeconds * attempt);
        }
    }
    throw new Error("Max retries exceeded");
}

async function findTransactionByHashV3(address: string, txHash: string): Promise<any | null> {
    try {
        await sleep(1); // Rate limiting
        const url = `https://testnet.toncenter.com/api/v3/transactions?account=${address}&limit=5&offset=0&sort=desc`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as any;
        const txHashBase64 = Buffer.from(txHash, 'hex').toString('base64');
        
        console.log(`Searching for hash: ${txHash} (base64: ${txHashBase64})`);
        console.log(`Found ${data.transactions?.length || 0} transactions`);
        
        for (const tx of data.transactions || []) {
            // Check all possible hash fields
            const checks = [
                { field: 'tx.hash', value: tx.hash },
                { field: 'tx.in_msg.hash', value: tx.in_msg?.hash },
                { field: 'tx.in_msg.message_content.hash', value: tx.in_msg?.message_content?.hash },
                { field: 'tx.in_msg.message_content.body_hash', value: tx.in_msg?.message_content?.body_hash },
                { field: 'tx.in_msg.hash_norm', value: tx.in_msg?.hash_norm }
            ];
            
            for (const check of checks) {
                if (check.value === txHashBase64) {
                    console.log(`✅ Found match in ${check.field}`);
                    console.log(`   Search hash: ${txHash}`);
                    console.log(`   Found hash:  ${check.value} (base64)`);
                    console.log(`   Tx hash:     ${tx.hash}`);
                    console.log(`   In msg hash: ${tx.in_msg?.hash}`);
                    console.log(`   Hash norm:   ${tx.in_msg?.hash_norm}`);
                    
                    // Always use transaction hash for TonScan link
                    const linkHash = tx.hash;
                    
                    return {
                        found: true,
                        hash: txHash,
                        type: check.field,
                        transaction: tx,
                        linkHash: linkHash
                    };
                }
            }
        }
        
        // Debug: show available hashes
        console.log('Available hashes in recent transactions:');
        for (let i = 0; i < Math.min(3, data.transactions?.length || 0); i++) {
            const tx = data.transactions[i];
            console.log(`  tx[${i}].hash: ${tx.hash}`);
            console.log(`  tx[${i}].in_msg?.hash: ${tx.in_msg?.hash}`);
            console.log(`  tx[${i}].in_msg?.hash_norm: ${tx.in_msg?.hash_norm}`);
            console.log(`  tx[${i}].in_msg?.message_content?.hash: ${tx.in_msg?.message_content?.hash}`);
        }
        
        return null;
    } catch (error) {
        console.error('Error searching transaction:', error);
        return null;
    }
}

async function searchBothHashes(address: string, originalHash: string, normalizedHash: string) {
    console.log('Searching for transactions...');
    
    const originalResult = await findTransactionByHashV3(address, originalHash);
    await sleep(1);
    const normalizedResult = await findTransactionByHashV3(address, normalizedHash);
    
    console.log('\nSearch Results:');
    console.log('Original hash found:', originalResult ? 'YES' : 'NO');
    if (originalResult) {
        console.log('  Type:', originalResult.type);
        console.log('  Transaction LT:', originalResult.transaction.lt);
        const linkHashHex = Buffer.from(originalResult.linkHash, 'base64').toString('hex');
        console.log('  TonScan link:', `https://testnet.tonscan.org/tx/${linkHashHex}`);
    }
    
    console.log('Normalized hash found:', normalizedResult ? 'YES' : 'NO');
    if (normalizedResult) {
        console.log('  Type:', normalizedResult.type);
        console.log('  Transaction LT:', normalizedResult.transaction.lt);
        const linkHashHex = Buffer.from(normalizedResult.linkHash, 'base64').toString('hex');
        console.log('  TonScan link:', `https://testnet.tonscan.org/tx/${linkHashHex}`);
    }
    
    return { originalResult, normalizedResult };
}

async function main() {
    console.log('Hash Analysis with Real Transaction');
    console.log('===================================');
    
    // Create message body
    const messageBody = createTextMessage("Hello TON!");
    console.log('Message Body Hash:', messageBody.hash().toString("hex"));

    // Initialize wallet
    const keyPair = await mnemonicToPrivateKey(MNEMONIC);
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    const walletAddress = wallet.address;
    console.log('Wallet Address:', walletAddress.toString());

    try {
        const client = new TonClient({ 
            endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC" 
        });
        const contract = client.open(wallet);

        // Get wallet data
        const seqno = await apiCallWithRetry(() => contract.getSeqno());
        const balance = await apiCallWithRetry(() => contract.getBalance());
        console.log('Current seqno:', seqno);
        console.log('Wallet balance:', balance.toString(), 'nanotons');

        if (balance < toNano("0.02")) {
            console.log('Insufficient balance for transaction');
            return;
        }

        // Create original external message via wrapper
        const internalMessage = internal({
            to: walletAddress,
            value: toNano("0.01"),
            body: messageBody
        });

        const externalMessage = await contract.createTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [internalMessage]
        });
        
        const originalHash = externalMessage.hash().toString("hex");
        const originalBoC = externalMessage.toBoc().toString("base64");
        
        console.log('\nOriginal External Message Hash:', originalHash);
        console.log('Original External Message BoC:', originalBoC);

        // Create normalized version using the internal message directly (legacy, incorrect)
        const normalizedExternalMessage = createNormalizedExternalMessage(walletAddress, internalMessage.body);
        const normalizedHash = normalizedExternalMessage.hash().toString("hex");
        const normalizedBoC = normalizedExternalMessage.toBoc().toString("base64");
        
        console.log('\nNormalized External Message Hash (legacy, incorrect):', normalizedHash);
        console.log('Normalized External Message BoC (legacy, incorrect):', normalizedBoC);
        
        // --- Correct TEP-467 normalization ---
        console.log('=== Cell tree structure ===');
        printCellTree(externalMessage);
        const normalizedTEP467 = normalizeExternalMessageTEP467(externalMessage);
        const normalizedTEP467Hash = normalizedTEP467.hash().toString("hex");
        const normalizedTEP467BoC = normalizedTEP467.toBoc().toString("base64");
        
        console.log('\nNormalized External Message Hash (TEP-467, correct):', normalizedTEP467Hash);
        console.log('Normalized External Message BoC (TEP-467, correct):', normalizedTEP467BoC);
        console.log('NOTE: Этот хеш должен совпадать с blockchain hash_norm для ЭТОЙ транзакции!');
        
        // Hash comparison
        console.log('\nHash Comparison:');
        console.log('Original Hash:   ', originalHash);
        console.log('Normalized Hash (legacy): ', normalizedHash);
        console.log('Normalized Hash (TEP-467):', normalizedTEP467Hash);
        console.log('Hashes Equal (original == legacy):    ', originalHash === normalizedHash ? 'YES' : 'NO');
        console.log('Hashes Equal (original == TEP-467):   ', originalHash === normalizedTEP467Hash ? 'YES' : 'NO');
        console.log('Hashes Equal (TEP-467 == blockchain hash_norm): Проверьте вручную!');
        
        // Send transaction
        console.log('\nSending transaction...');
        await apiCallWithRetry(async () => {
            await contract.send(externalMessage);
            return true;
        });
        console.log('Transaction sent successfully');
        console.log('External message hash:', originalHash);

        // Wait for blockchain propagation
        console.log('Waiting for blockchain propagation...');
        await sleep(15); // Increased wait time for indexing
        
        // Search for both hashes
        await searchBothHashes(walletAddress.toString(), originalHash, normalizedTEP467Hash);
        
        console.log('\nTonScan link: https://testnet.tonscan.org/address/' + walletAddress.toString());

    } catch (error: any) {
        console.error('Error:', error.message || error);
    }
}

main().catch(console.error);

