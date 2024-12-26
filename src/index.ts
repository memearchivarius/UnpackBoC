import { Cell, loadMessage, Slice } from "@ton/core";

const extBoC = 'te6cckEBAwEArgABRYgByPhs6XS3ySU4PBGeUMPDkmbgdOO8DbnsEQjMyPjRINoMAQGcIvyyo+n+sjJxdy3qgsVqEpRshFegbvUxCEgiZaiCI8uLovDkgIIyfXcJ5aYY41j8SdGfIHkKrZvhvWaWE/G6ASmpoxdnbGt7AAAQJwADAgBqQgBQbFJh0GELp4LOrgEjC2Alr6yJUARIgNQ+yXkHVoi7vygXuufIAAAAAAAAAAAAAAAAAAA4Ye4w'
const intBoC = 'te6cckEBBwEA3QADs2gB7ix8WDhQdzzFOCf6hmZ2Dzw2vFNtbavUArvbhXqqqmEAMpuMhx8zp7O3wqMokkuyFkklKpftc4Dh9_5bvavmCo-UXR6uVOIGMkCwAAAAAAC3GwLLUHl_4AYCAQCA_____________________________________________________________________________________gMBPAUEAwFDoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAUACAAAAAAAAAANoAAAAAEIDF-r-4Q'

const extHash = Cell.fromBase64(extBoC).hash().toString('hex');
const msg = loadMessage(Cell.fromBase64(extBoC).beginParse());
const body = msg.body.beginParse().skip(512+32+32+32); //skip singnature, subwallet, vali_until, seqno
const op = body.loadUint(8);
if (op == 0) { //send int_msg
var mode = body.loadUint(8);
var ref = body.loadRef().beginParse();
var head = ref.loadUint(4); // 0110 = 6 | 0100 = 4 | 0000 = 0
var src = ref.loadAddressAny();
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
    '\n',
    extHash, '\n',
    msg, '\n',
    op, '\n',
    mode,'\n',
    head,'\n',
    src,'\n',
    destAddress,'\n',
    value,'\n',
    ihr,'\n',
    fwd,'\n',
    lt_create,'\n',
    unix_create,'\n',
    isInit,'\n',
    isBodyRef,'\n',
    ref
);

/*

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