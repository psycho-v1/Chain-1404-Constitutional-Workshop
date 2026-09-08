// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ConstitutionalWorkshop
/// @notice Formation record for Chain 1404. Not a treasury. Not a Governor.
/// @dev All policy knobs are immutable. Sealed storage has no writer except seal().
contract ConstitutionalWorkshop {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    type SeatId is uint32;
    type ClauseId is uint32;

    struct Seat {
        SeatId id;
        uint64 joinedAt;
        uint64 leftAt;
        uint16 authored;
        uint16 unsealed;
    }

    struct Clause {
        address author;
        uint64 postedAt;
        uint32 census;
        uint32 yea;
        uint32 nay;
        uint8 article;
        uint8 state; // 1 = open, 2 = sealed
        bytes32 titleHash;
        bytes32 bodyHash;
        string title;
        string body;
    }

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error Closed();
    error NotYet();
    error Ended();
    error Bound();
    error Vacant();
    error Gone();
    error Dup();
    error BadBond();
    error BadWindow();
    error BadParam();
    error TooLong();
    error Empty();
    error BadArticle();
    error Quota();
    error Unknown();
    error Frozen();
    error Early();
    error Short();
    error Thin();
    error SinkRefused();
    error LiveCode();
    error NoCash();
    error Same();
    error Locked();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Seated(address indexed who, uint32 id);
    event Vacated(address indexed who, uint32 id);
    event Posted(uint32 indexed id, address indexed author, uint8 article, bytes32 bodyHash);
    event Balloted(uint32 indexed id, address indexed who, bool yea);
    event Sealed(uint32 indexed id, bytes32 clauseHash, bytes32 rollingRoot);

    // -------------------------------------------------------------------------
    // Immutables / constants
    // -------------------------------------------------------------------------

    uint8 public constant STATE_OPEN = 1;
    uint8 public constant STATE_SEALED = 2;

    uint16 public constant QUORUM_BPS = 5_000;
    uint16 public constant PASS_BPS = 5_000;
    uint32 public constant MIN_AGE = 3 days;
    uint16 public constant MAX_TITLE = 140;
    uint16 public constant MAX_BODY = 2_048;
    uint8 public constant MAX_UNSEALED = 5;
    uint8 public constant ARTICLES = 5;
    uint16 public constant BPS_DENOM = 10_000;

    address public constant SINK = 0x000000000000000000000000000000000000dEaD;

    uint64 public immutable openedAt;
    uint64 public immutable closedAt;
    uint96 public immutable seatBond;
    bytes32 public immutable genesis;

    // -------------------------------------------------------------------------
    // Store
    // -------------------------------------------------------------------------

    uint32 public issued;
    uint32 public active;
    uint32 public posted;
    uint32 public sealedCount;
    bytes32 public rollingRoot;
    uint256 private _gate;

    mapping(address => Seat) private _seats;
    mapping(uint32 => Clause) private _clauses;
    // 0 = silent, 1 = yea, 2 = nay
    mapping(uint32 => mapping(address => uint8)) private _mark;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    constructor(uint64 openedAt_, uint64 closedAt_, uint96 seatBond_) {
        if (seatBond_ == 0) revert BadBond();
        if (closedAt_ <= openedAt_) revert BadWindow();
        if (closedAt_ - openedAt_ < 14 days) revert BadWindow();
        if (closedAt_ - openedAt_ > 730 days) revert BadWindow();
        if (openedAt_ + 1 days < block.timestamp) revert BadWindow();
        uint256 sinkCode;
        address sink = SINK;
        assembly ("memory-safe") {
            sinkCode := extcodesize(sink)
        }
        if (sinkCode != 0) revert LiveCode();

        openedAt = openedAt_;
        closedAt = closedAt_;
        seatBond = seatBond_;
        genesis = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                openedAt_,
                closedAt_,
                seatBond_,
                QUORUM_BPS,
                PASS_BPS,
                MIN_AGE
            )
        );
    }

    // -------------------------------------------------------------------------
    // Cash
    // -------------------------------------------------------------------------

    receive() external payable {
        revert NoCash();
    }

    fallback() external payable {
        revert NoCash();
    }

    // -------------------------------------------------------------------------
    // Seats
    // -------------------------------------------------------------------------

    function attest() external payable unkeyed {
        _live();
        if (msg.value != uint256(seatBond)) revert BadBond();
        Seat storage s = _seats[msg.sender];
        if (SeatId.unwrap(s.id) != 0 || s.leftAt != 0) revert Bound();

        uint32 n = issued + 1;
        issued = n;
        active = active + 1;
        s.id = SeatId.wrap(n);
        s.joinedAt = uint64(block.timestamp);

        _burn(msg.value);
        emit Seated(msg.sender, n);
    }

    function revoke() external unkeyed {
        Seat storage s = _seats[msg.sender];
        uint32 id = SeatId.unwrap(s.id);
        if (id == 0) revert Vacant();

        s.id = SeatId.wrap(0);
        s.leftAt = uint64(block.timestamp);
        active = active - 1;
        emit Vacated(msg.sender, id);
    }

    // -------------------------------------------------------------------------
    // Clauses
    // -------------------------------------------------------------------------

    function submit(uint8 article, string calldata title, string calldata body) external unkeyed returns (uint32 id) {
        _live();
        Seat storage s = _needSeat(msg.sender);
        if (article == 0 || article > ARTICLES) revert BadArticle();
        uint256 tlen = bytes(title).length;
        uint256 blen = bytes(body).length;
        if (tlen == 0 || blen == 0) revert Empty();
        if (tlen > MAX_TITLE || blen > MAX_BODY) revert TooLong();
        if (s.unsealed >= MAX_UNSEALED) revert Quota();

        id = posted + 1;
        posted = id;

        bytes32 th = keccak256(bytes(title));
        bytes32 bh = keccak256(bytes(body));

        Clause storage c = _clauses[id];
        c.author = msg.sender;
        c.postedAt = uint64(block.timestamp);
        c.census = active;
        c.article = article;
        c.state = STATE_OPEN;
        c.titleHash = th;
        c.bodyHash = bh;
        c.title = title;
        c.body = body;

        s.authored += 1;
        s.unsealed += 1;

        emit Posted(id, msg.sender, article, bh);
    }

    function vote(uint32 id, bool yea) external unkeyed {
        Clause storage c = _clauses[id];
        if (c.state == 0) revert Unknown();
        if (c.state != STATE_OPEN) revert Frozen();

        Seat storage s = _needSeat(msg.sender);
        if (s.joinedAt > c.postedAt) revert NotYet();

        uint8 want = yea ? 1 : 2;
        uint8 had = _mark[id][msg.sender];
        if (had == want) revert Same();

        if (had == 1) c.yea -= 1;
        else if (had == 2) c.nay -= 1;

        if (want == 1) c.yea += 1;
        else c.nay += 1;

        _mark[id][msg.sender] = want;
        emit Balloted(id, msg.sender, yea);
    }

    function seal(uint32 id) external unkeyed {
        Clause storage c = _clauses[id];
        if (c.state == 0) revert Unknown();
        if (c.state != STATE_OPEN) revert Frozen();
        if (block.timestamp < uint256(c.postedAt) + MIN_AGE) revert Early();

        uint256 census = c.census;
        if (census == 0) revert Thin();
        if (uint256(c.yea) * BPS_DENOM < uint256(QUORUM_BPS) * census) revert Short();

        uint256 cast = uint256(c.yea) + uint256(c.nay);
        if (cast == 0) revert Thin();
        if (uint256(c.yea) * BPS_DENOM < uint256(PASS_BPS) * cast) revert Thin();
        if (c.yea <= c.nay) revert Thin();

        c.state = STATE_SEALED;
        sealedCount += 1;

        Seat storage a = _seats[c.author];
        if (a.unsealed > 0) a.unsealed -= 1;

        bytes32 leaf = keccak256(
            abi.encode(
                id,
                c.author,
                c.article,
                c.titleHash,
                c.bodyHash,
                c.yea,
                c.nay,
                c.census,
                c.postedAt
            )
        );
        rollingRoot = keccak256(abi.encode(rollingRoot, leaf));
        emit Sealed(id, leaf, rollingRoot);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function seatOf(address who) external view returns (Seat memory) {
        return _seats[who];
    }

    function clause(uint32 id) external view returns (Clause memory) {
        return _clauses[id];
    }

    function ballotOf(uint32 id, address who) external view returns (uint8) {
        return _mark[id][who];
    }

    function clauseDigest(uint32 id) external view returns (bytes32) {
        Clause storage c = _clauses[id];
        if (c.state == 0) revert Unknown();
        return keccak256(abi.encode(c.article, c.titleHash, c.bodyHash));
    }

    function sealReady(uint32 id) external view returns (bool ready, bytes4 reason) {
        Clause storage c = _clauses[id];
        if (c.state == 0) return (false, Unknown.selector);
        if (c.state != STATE_OPEN) return (false, Frozen.selector);
        if (block.timestamp < uint256(c.postedAt) + MIN_AGE) return (false, Early.selector);
        uint256 census = c.census;
        if (census == 0) return (false, Thin.selector);
        if (uint256(c.yea) * BPS_DENOM < uint256(QUORUM_BPS) * census) return (false, Short.selector);
        uint256 cast = uint256(c.yea) + uint256(c.nay);
        if (cast == 0) return (false, Thin.selector);
        if (uint256(c.yea) * BPS_DENOM < uint256(PASS_BPS) * cast) return (false, Thin.selector);
        if (c.yea <= c.nay) return (false, Thin.selector);
        return (true, bytes4(0));
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    function _live() internal view {
        uint256 t = block.timestamp;
        if (t < openedAt) revert NotYet();
        if (t > closedAt) revert Ended();
    }

    function _needSeat(address who) internal view returns (Seat storage s) {
        s = _seats[who];
        if (SeatId.unwrap(s.id) == 0) revert Vacant();
        if (s.leftAt != 0) revert Gone();
    }

    function _burn(uint256 amt) internal {
        address sink = SINK;
        assembly ("memory-safe") {
            let ok := call(gas(), sink, amt, 0, 0, 0, 0)
            if iszero(ok) {
                mstore(0x00, 0x3e075961) // SinkRefused()
                revert(0x1c, 0x04)
            }
        }
    }

    modifier unkeyed() {
        if (_gate != 0) revert Locked();
        _gate = 1;
        _;
        _gate = 0;
    }
}
