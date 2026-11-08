/** Overlapping credit card display with typography matching constraints */
export function CreditCards() {
  return (
    <div className="relative h-[220px] select-none pt-2">
      {/* Background card (Cyan wave gradient) */}
      <div
        className="absolute w-[86%] right-0 top-11 rounded-3xl p-5 text-white shadow-md overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #18b6e6 0%, #3e68e4 55%, #5a4ff5 100%)",
        }}
      >
        <div className="flex items-center justify-between font-roboto text-[11px] font-medium opacity-90">
          <span>Credit Card</span>
          <span className="font-poppins font-black italic tracking-wider text-xs">VISA</span>
        </div>

        <p className="mt-4 font-poppins text-sm tracking-wider font-semibold opacity-95">
          1234 5678 9101 1121
        </p>

        <div className="mt-4 flex items-end justify-between font-roboto text-xs">
          <div>
            <p className="font-medium text-white/95">Jack Lewis</p>
          </div>
          <span className="text-[11px] font-medium opacity-80">06/24</span>
        </div>
      </div>

      {/* Foreground card (Deep Purple / Indigo) */}
      <div
        className="absolute w-[90%] left-0 top-0 z-10 rounded-3xl p-5 text-white shadow-[0_12px_30px_rgba(45,35,115,0.2)] overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #37337c 0%, #4c46b4 45%, #6a60ea 100%)",
        }}
      >
        {/* Soft fluid light accents */}
        <div className="absolute -right-8 -bottom-10 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none" />

        {/* Card Header: "Credit Card" + Mastercard Logo */}
        <div className="flex items-center justify-between">
          <span className="font-roboto text-xs font-medium text-white/90">Credit Card</span>
          <div className="flex items-center -space-x-2">
            <span className="h-5 w-5 rounded-full bg-[#eb001b]" />
            <span className="h-5 w-5 rounded-full bg-[#f79e1b] opacity-90" />
          </div>
        </div>

        {/* Card Number */}
        <p className="mt-6 font-poppins text-sm tracking-widest font-semibold text-white drop-shadow-sm">
          1234 5678 9101 1121
        </p>

        {/* Card Holder */}
        <div className="mt-6 flex items-center justify-between">
          <p className="font-roboto text-xs font-medium text-white/95 tracking-wide">
            Jack Lewis
          </p>
          <span className="font-roboto text-[10px] text-white/60 tracking-wider">PREMIUM</span>
        </div>
      </div>
    </div>
  );
}
