import { Address, beginCell, Cell, loadMessage, Slice } from "@ton/core";

const extBoC = 'te6cckEBAwEArgABRYgByPhs6XS3ySU4PBGeUMPDkmbgdOO8DbnsEQjMyPjRINoMAQGcIvyyo+n+sjJxdy3qgsVqEpRshFegbvUxCEgiZaiCI8uLovDkgIIyfXcJ5aYY41j8SdGfIHkKrZvhvWaWE/G6ASmpoxdnbGt7AAAQJwADAgBqQgBQbFJh0GELp4LOrgEjC2Alr6yJUARIgNQ+yXkHVoi7vygXuufIAAAAAAAAAAAAAAAAAAA4Ye4w'
const intBoC = 'te6cckEBBwEA3QADs2gB7ix8WDhQdzzFOCf6hmZ2Dzw2vFNtbavUArvbhXqqqmEAMpuMhx8zp7O3wqMokkuyFkklKpftc4Dh9_5bvavmCo-UXR6uVOIGMkCwAAAAAAC3GwLLUHl_4AYCAQCA_____________________________________________________________________________________gMBPAUEAwFDoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAUACAAAAAAAAAANoAAAAAEIDF-r-4Q'

const extHash = Cell.fromBase64(extBoC).hash().toString('hex');
const msgcell = Cell.fromBase64(extBoC);
const msg = loadMessage(Cell.fromBase64(extBoC).beginParse());
const body = msg.body.beginParse().skip(512+32+32+32); //skip singnature, subwallet, vali_until, seqno
const op = body.loadUint(8);
if (op == 0) { //send int_msg
    var mode = body.loadUint(8);
    var ref = body.loadRef().beginParse();
    var head = ref.loadUint(4); // 0110 = 6 | 0100 = 4 | 0000 = 0 check int_msg struct below
    var src = ref.loadAddressAny(); //loadUint(2); // 00 = addr_none
    var destAddress = ref.loadAddress();
    var value = ref.loadCoins();
    var ihr = ref.skip(1).loadCoins();
    var fwd = ref.loadCoins();
    var lt_create = ref.loadUint(64);
    var unix_create = ref.loadUint(32);
    var isInit = ref.loadBit();
    var isBodyRef = ref.loadBit();
}
if (op == 1) {
    //deploy & install plugin payload
    }
if (op == 2) {
    //install plugin
}
if (op == 3) {
    //remove plugin
}

console.log(
    '\n Hash:', extHash,
    '\n Cell tree: \n', msgcell,
    '\n', msg,
    '\n Ext_msg OP:', op,
    '\n In_msg mode:', mode,
    '\n First 4 bit of in_msg in decimal: ', head,
    '\n Src_addr: ', src,
    '\n Dst_addr: ', destAddress,
    '\n msg_value:', value,
    '\n IHR fee: ', ihr,
    '\n FWD fee: ', fwd,
    '\n lt:   ', lt_create,
    '\n unix: ', unix_create,
    '\n Init present? ', isInit,
    '\n Body in ref?  ', isBodyRef,
    '\n Rest of the msg_body: ', ref
);

console.log('\n');
console.log('\n');
console.log('\n');
console.log('Example of normalized external message grabbed from blockchain:');

// https://explorer.toncoin.org/transaction?account=0:e47c3674ba5be4929c1e08cf2861e1c933703a71de06dcf6088466647c68906d&lt=52228866000001&hash=b21022c805f9795e3f4449d636d70567de14524fcbbd1b3a92f1622862e13b93
const wrongHash = 'C14B39E64B9ED604474FE0AD9C8EEA1F736F884C04DA4AACE5D3D81ABDD6BEC0'
console.log('\n Hash from explorer:', wrongHash);
// https://toncenter.com/api/v3/transactions?account=UQDkfDZ0ulvkkpweCM8oYeHJM3A6cd4G3PYIhGZkfGiQbSUO&lt=52228866000001&limit=10&offset=0&sort=desc
// Taken from in_msg: Body 
const bodyBoC = 'te6cckEBAgEAiAABnCL8sqPp/rIycXct6oLFahKUbIRXoG71MQhIImWogiPLi6Lw5ICCMn13CeWmGONY/EnRnyB5Cq2b4b1mlhPxugEpqaMXZ2xrewAAECcAAwEAakIAUGxSYdBhC6eCzq4BIwtgJa+siVAESIDUPsl5B1aIu78oF7rnyAAAAAAAAAAAAAAAAAAA+LHs5A=='
// Normalized ext_msg
let externalMessage = beginCell()
.storeUint(0b10, 2) // ext_msg prefix
.storeUint(0, 2) // src -> addr_none
.storeAddress(Address.parse('0:E47C3674BA5BE4929C1E08CF2861E1C933703A71DE06DCF6088466647C68906D')) // in_msg: Destination
.storeCoins(0) // Import Fee
.storeBit(0) // No State Init
.storeBit(1) // We store Message Body as a reference
.storeRef(Cell.fromBase64(bodyBoC)) // Store in_msg: Body as a reference
.endCell();

const newextBoC = externalMessage.toBoc().toString("base64");
const newextHash = Cell.fromBase64(newextBoC).hash().toString('hex').toUpperCase();
console.log('\n Normalized Hash:', newextHash);
console.log('\n Normalized Cell tree: \n', externalMessage);

/*
https://docs.ton.org/v3/guidelines/smart-contracts/howto/wallet#internal-message-creation
https://docs.ton.org/v3/guidelines/smart-contracts/howto/wallet#external-message-creation

let internalMessage = beginCell()
  .storeUint(0, 1) // indicate that it is an internal message -> int_msg_info$0
  .storeBit(1) // IHR Disabled
  .storeBit(0) // bounce
  .storeBit(0) // bounced
  .storeUint(0, 2) // src -> addr_none
  .storeAddress(walletAddress)
  .storeCoins(toNano("0.2")) // amount
  .storeBit(0) // Extra currency
  .storeCoins(0) // IHR Fee
  .storeCoins(0) // Forwarding Fee
  .storeUint(0, 64) // Logical time of creation
  .storeUint(0, 32) // UNIX time of creation
  .storeBit(0) // No State Init
  .storeBit(1) // We store Message Body as a reference
  .storeRef(internalMessageBody) // Store Message Body as a reference
  .endCell();

() recv_external(slice in_msg) impure {
  var signature = in_msg~load_bits(512);
  var cs = in_msg;
  var (subwallet_id, valid_until, msg_seqno) = (cs~load_uint(32), cs~load_uint(32), cs~load_uint(32));
  throw_if(36, valid_until <= now());
  var ds = get_data().begin_parse();
  var (stored_seqno, stored_subwallet, public_key, plugins) = (ds~load_uint(32), ds~load_uint(32), ds~load_uint(256), ds~load_dict());
  ds.end_parse();
  throw_unless(33, msg_seqno == stored_seqno);
  throw_unless(34, subwallet_id == stored_subwallet);
  throw_unless(35, check_signature(slice_hash(in_msg), signature, public_key));
  accept_message();
  set_data(begin_cell()
    .store_uint(stored_seqno + 1, 32)
    .store_uint(stored_subwallet, 32)
    .store_uint(public_key, 256)
    .store_dict(plugins)
    .end_cell());
  commit();
  cs~touch();
  int op = cs~load_uint(8);

  if (op == 0) { ;; simple send
    while (cs.slice_refs()) {
      var mode = cs~load_uint(8);
      send_raw_message(cs~load_ref(), mode);
    }
    return (); ;; have already saved the storage
  }

*/