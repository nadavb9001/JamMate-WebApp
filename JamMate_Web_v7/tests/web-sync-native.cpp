#include <cassert>
#include <cstdint>
#include <cstdio>
#include "JmWebSyncProtocol.hpp"
int main(){
 using namespace JmWebSync;
 const uint8_t b[]={1,2,3,4,5};
 assert(crc16(b,5)==0xbb2a);
 uint8_t h[2];put16(h,0xABCD);assert(h[0]==0xCD&&h[1]==0xAB);
 assert(validSlot(0,0)&&validSlot(6,4)&&!validSlot(7,0)&&!validSlot(1,5));
 assert(PARAM_CHANGE==0x36&&CATALOG_DATA==0x38&&BEAT==0x3c);
 puts("PASS C++ WebSync protocol: CRC parity, slot bounds, endian, command map");
}
