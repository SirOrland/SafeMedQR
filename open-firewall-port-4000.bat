@echo off
echo Opening port 4000 for SafeMedsQR API...
netsh advfirewall firewall add rule name="SafeMedsQR API port 4000" dir=in action=allow protocol=TCP localport=4000
echo Done! Port 4000 is now open.
pause
