// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ConstitutionalWorkshop} from "../contracts/ConstitutionalWorkshop.sol";

contract ConstitutionalWorkshopTest is Test {
    ConstitutionalWorkshop rec;

    uint64 openAt;
    uint64 closeAt;
    uint96 bond = 1 ether;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address cara = address(0xCA2A);
    address dave = address(0xDA1E);

    function setUp() public {
        openAt = uint64(block.timestamp + 1 hours);
        closeAt = uint64(openAt + 30 days);
        rec = new ConstitutionalWorkshop(openAt, closeAt, bond);
        vm.deal(alice, 50 ether);
        vm.deal(bob, 50 ether);
        vm.deal(cara, 50 ether);
        vm.deal(dave, 50 ether);
    }

    function _join(address who) internal {
        if (block.timestamp < openAt + 1) vm.warp(openAt + 1);
        else vm.warp(block.timestamp + 1);
        vm.prank(who);
        rec.attest{value: bond}();
    }

    function test_constructorStoresGenesis() public view {
        assertEq(rec.openedAt(), openAt);
        assertEq(rec.closedAt(), closeAt);
        assertEq(rec.seatBond(), bond);
        assertTrue(rec.genesis() != bytes32(0));
    }

    function test_rejectBadWindows() public {
        vm.expectRevert(ConstitutionalWorkshop.BadWindow.selector);
        new ConstitutionalWorkshop(openAt, openAt, bond);
        vm.expectRevert(ConstitutionalWorkshop.BadWindow.selector);
        new ConstitutionalWorkshop(openAt, openAt + 13 days, bond);
        vm.expectRevert(ConstitutionalWorkshop.BadWindow.selector);
        new ConstitutionalWorkshop(openAt, openAt + 731 days, bond);
        vm.expectRevert(ConstitutionalWorkshop.BadBond.selector);
        new ConstitutionalWorkshop(openAt, closeAt, 0);
    }

    function test_rejectPastOpen() public {
        vm.warp(100 days);
        vm.expectRevert(ConstitutionalWorkshop.BadWindow.selector);
        new ConstitutionalWorkshop(uint64(1 days), uint64(40 days), bond);
    }

    function test_refuseLooseEther() public {
        vm.warp(openAt + 1);
        vm.expectRevert(ConstitutionalWorkshop.NoCash.selector);
        payable(address(rec)).transfer(1 wei);
        vm.expectRevert(ConstitutionalWorkshop.NoCash.selector);
        (bool ok,) = address(rec).call{value: 1 wei}(hex"abcd");
        ok;
    }

    function test_attestExactBond() public {
        vm.warp(openAt + 1);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.BadBond.selector);
        rec.attest{value: bond - 1}();
        vm.prank(alice);
        rec.attest{value: bond}();
        assertEq(rec.active(), 1);
        assertEq(rec.issued(), 1);
        assertEq(address(rec).balance, 0);
        assertEq(rec.SINK().balance, bond);
        ConstitutionalWorkshop.Seat memory s = rec.seatOf(alice);
        assertEq(uint256(SeatIdUnwrap(s.id)), 1);
    }

    function test_noDoubleAttestAndNoRejoin() public {
        _join(alice);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Bound.selector);
        rec.attest{value: bond}();
        vm.prank(alice);
        rec.revoke();
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Bound.selector);
        rec.attest{value: bond}();
        assertEq(rec.active(), 0);
        assertEq(rec.issued(), 1);
    }

    function test_beforeOpenAndAfterClose() public {
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.NotYet.selector);
        rec.attest{value: bond}();
        vm.warp(closeAt + 1);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Ended.selector);
        rec.attest{value: bond}();
    }

    function test_submitAndVoteAndSeal() public {
        _join(alice);
        _join(bob);
        _join(cara);

        vm.prank(alice);
        uint32 id = rec.submit(2, "Timelock Governor", "The Governor SHALL be a timelock.");
        assertEq(id, 1);
        assertEq(rec.posted(), 1);

        vm.prank(alice);
        rec.vote(id, true);
        vm.prank(bob);
        rec.vote(id, true);
        vm.prank(cara);
        rec.vote(id, false);

        vm.expectRevert(ConstitutionalWorkshop.Early.selector);
        rec.seal(id);

        vm.warp(block.timestamp + 3 days);
        rec.seal(id);

        ConstitutionalWorkshop.Clause memory c = rec.clause(id);
        assertEq(c.state, rec.STATE_SEALED());
        assertEq(c.yea, 2);
        assertEq(c.nay, 1);
        assertEq(rec.sealedCount(), 1);
        assertTrue(rec.rollingRoot() != bytes32(0));
        assertEq(rec.seatOf(alice).unsealed, 0);
    }

    function test_lateJoinerCannotVoteOldClause() public {
        _join(alice);
        _join(bob);
        vm.prank(alice);
        uint32 id = rec.submit(1, "Equal seats", "Seats SHALL be equal.");
        _join(cara);
        vm.prank(cara);
        vm.expectRevert(ConstitutionalWorkshop.NotYet.selector);
        rec.vote(id, true);
    }

    function test_revokedCannotVote() public {
        _join(alice);
        _join(bob);
        vm.prank(alice);
        uint32 id = rec.submit(1, "Equal seats", "Seats SHALL be equal.");
        vm.prank(bob);
        rec.revoke();
        vm.prank(bob);
        vm.expectRevert(ConstitutionalWorkshop.Vacant.selector);
        rec.vote(id, true);
    }

    function test_voteChangeAdjustsTallies() public {
        _join(alice);
        _join(bob);
        vm.prank(alice);
        uint32 id = rec.submit(3, "No treasury", "v1 SHALL NOT move funds.");
        vm.prank(bob);
        rec.vote(id, true);
        assertEq(rec.clause(id).yea, 1);
        vm.prank(bob);
        rec.vote(id, false);
        assertEq(rec.clause(id).yea, 0);
        assertEq(rec.clause(id).nay, 1);
        vm.prank(bob);
        vm.expectRevert(ConstitutionalWorkshop.Same.selector);
        rec.vote(id, false);
    }

    function test_quorumAndMajorityGateSeal() public {
        _join(alice);
        _join(bob);
        _join(cara);
        _join(dave);
        vm.prank(alice);
        uint32 id = rec.submit(4, "Public RPC", "Canonical RPC SHALL be community operable.");
        vm.prank(alice);
        rec.vote(id, true);
        vm.warp(block.timestamp + 3 days);
        // 1/4 = 25% < 50% quorum
        vm.expectRevert(ConstitutionalWorkshop.Short.selector);
        rec.seal(id);
        vm.prank(bob);
        rec.vote(id, true);
        rec.seal(id);
        assertEq(rec.clause(id).state, rec.STATE_SEALED());
    }

    function test_nayMajorityBlocksSeal() public {
        _join(alice);
        _join(bob);
        _join(cara);
        _join(dave);
        vm.prank(alice);
        uint32 id = rec.submit(5, "Bad clause", "This SHALL fail.");
        vm.prank(alice);
        rec.vote(id, true);
        vm.prank(bob);
        rec.vote(id, true);
        vm.prank(cara);
        rec.vote(id, false);
        vm.prank(dave);
        rec.vote(id, false);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(ConstitutionalWorkshop.Thin.selector);
        rec.seal(id);
    }

    function test_submitBounds() public {
        _join(alice);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.BadArticle.selector);
        rec.submit(0, "x", "y");
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.BadArticle.selector);
        rec.submit(6, "x", "y");
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Empty.selector);
        rec.submit(1, "", "body");
        bytes memory longTitle = new bytes(141);
        for (uint256 i; i < 141; ++i) longTitle[i] = "a";
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.TooLong.selector);
        rec.submit(1, string(longTitle), "body");
    }

    function test_unsealedQuota() public {
        _join(alice);
        _join(bob);
        for (uint8 i = 1; i <= 5; ++i) {
            vm.prank(alice);
            rec.submit(i, _title(i), "The record SHALL keep this clause.");
        }
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Quota.selector);
        rec.submit(1, "sixth", "The record SHALL reject the sixth open clause.");
    }

    function test_sealAfterWorkshopEnds() public {
        _join(alice);
        _join(bob);
        vm.prank(alice);
        uint32 id = rec.submit(1, "Last day", "Sealing SHALL outlive the submit window.");
        vm.prank(alice);
        rec.vote(id, true);
        vm.prank(bob);
        rec.vote(id, true);
        vm.warp(closeAt + 10 days);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Ended.selector);
        rec.submit(1, "too late", "no");
        rec.seal(id);
        assertEq(rec.clause(id).state, rec.STATE_SEALED());
    }

    function test_unknownClause() public {
        vm.expectRevert(ConstitutionalWorkshop.Unknown.selector);
        rec.vote(9, true);
        vm.expectRevert(ConstitutionalWorkshop.Unknown.selector);
        rec.seal(9);
    }

    function test_cannotVoteOrResealFrozen() public {
        _join(alice);
        _join(bob);
        vm.prank(alice);
        uint32 id = rec.submit(1, "Once", "A sealed clause SHALL stay sealed.");
        vm.prank(alice);
        rec.vote(id, true);
        vm.prank(bob);
        rec.vote(id, true);
        vm.warp(block.timestamp + 3 days);
        rec.seal(id);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.Frozen.selector);
        rec.vote(id, false);
        vm.expectRevert(ConstitutionalWorkshop.Frozen.selector);
        rec.seal(id);
    }

    function test_sealReadyView() public {
        _join(alice);
        _join(bob);
        vm.prank(alice);
        uint32 id = rec.submit(1, "View", "sealReady SHALL match seal().");
        (bool ready, bytes4 why) = rec.sealReady(id);
        assertFalse(ready);
        assertEq(why, ConstitutionalWorkshop.Early.selector);
        vm.prank(alice);
        rec.vote(id, true);
        vm.prank(bob);
        rec.vote(id, true);
        vm.warp(block.timestamp + 3 days);
        (ready, why) = rec.sealReady(id);
        assertTrue(ready);
        assertEq(why, bytes4(0));
    }

    function testFuzz_bondMustMatch(uint96 v) public {
        vm.assume(v != bond);
        vm.warp(openAt + 1);
        vm.deal(alice, uint256(v) + 1);
        vm.prank(alice);
        vm.expectRevert(ConstitutionalWorkshop.BadBond.selector);
        rec.attest{value: v}();
    }

    function SeatIdUnwrap(ConstitutionalWorkshop.SeatId id) internal pure returns (uint32) {
        return uint32(ConstitutionalWorkshop.SeatId.unwrap(id));
    }

    function _title(uint8 i) internal pure returns (string memory) {
        if (i == 1) return "one";
        if (i == 2) return "two";
        if (i == 3) return "three";
        if (i == 4) return "four";
        return "five";
    }
}
