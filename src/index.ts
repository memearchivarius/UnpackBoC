import { Address, beginCell, Cell, loadMessage, Slice } from "@ton/core";

// Hash of the multisig-v2 contract
let hash = 'b5ee9c72010101010023000842020f1ad3d8a46bd283321dde639195fb72602e9b31b1727fecc25e2edc10966df4';

// Create a lib cell with the hash
let lib_cell = beginCell()
    .storeUint(0x2, 8)  // Library cell type
    .storeBuffer(Buffer.from(hash, 'hex'))  // Store the hash as buffer
    .endCell({ exotic: true });

// Parse the cell
let cs = lib_cell.beginParse();
cs.skip(8);  // Skip type byte
let lib_data = cs.loadBuffer(32);  // Load 32 bytes (256 bits)

console.log('Library data:', lib_data.toString('hex'));